"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileQuestion,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STORAGE_BUCKETS } from "@/lib/storage/storage-constants";
import {
  MAX_INLINE_PREVIEW_BYTES,
  detectFileKind,
  formatFileSize,
  prismLanguage,
  type FileKind,
  type ProjectFile,
} from "@/types/file";

/**
 * The syntax highlighter is ~300KB with its Prism bundle. It is only pulled in
 * when a code file is actually opened, so the rest of the app — and the file
 * list itself — never pays for it (TODO.md §34).
 */
const CodeBlock = dynamic(() => import("./code-block"), {
  ssr: false,
  loading: () => (
    <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading preview...
    </p>
  ),
});

interface FileViewerProps {
  file: ProjectFile | null;
  /** Ordered list backing the prev/next controls. */
  files: ProjectFile[];
  onClose: () => void;
  onNavigate: (file: ProjectFile) => void;
}

export function FileViewer({
  file,
  files,
  onClose,
  onNavigate,
}: FileViewerProps) {
  const index = file ? files.findIndex((f) => f.id === file.id) : -1;
  const previous = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;

  // Arrow keys move through the list; Radix already handles Escape.
  useEffect(() => {
    if (!file) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && previous) onNavigate(previous);
      if (event.key === "ArrowRight" && next) onNavigate(next);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, previous, next, onNavigate]);

  if (!file) return null;

  const kind = detectFileKind(file);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="truncate pr-8 text-sm font-medium">
            {file.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {formatFileSize(file.size_bytes)}
            {file.mime_type && <> · {file.mime_type}</>}
            {files.length > 1 && (
              <> · {index + 1} of {files.length}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-64 overflow-auto bg-background-secondary">
          {/* Keyed so navigating to another file remounts the preview with a
              clean signed-URL fetch instead of showing the previous one. */}
          <FilePreview key={file.id} file={file} kind={kind} />
        </div>

        <footer className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <Button
            variant="outline"
            size="sm"
            disabled={!previous}
            onClick={() => previous && onNavigate(previous)}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!next}
            onClick={() => next && onNavigate(next)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>

          <DownloadButton file={file} />
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Files live in a private bucket, so every preview needs a short-lived signed
 * URL rather than a public link.
 */
function useSignedUrl(file: ProjectFile, enabled: boolean) {
  const shouldFetch = enabled && Boolean(file.storage_path);

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Derived at mount rather than corrected inside the effect, so nothing sets
  // state synchronously during render. FilePreview is keyed by file id, so a
  // different file remounts this hook with a fresh initial value.
  const [loading, setLoading] = useState(shouldFetch);

  useEffect(() => {
    if (!shouldFetch) return;

    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: signError } = await supabase.storage
          .from(STORAGE_BUCKETS.FILES)
          .createSignedUrl(file.storage_path!, 60 * 10);

        if (cancelled) return;
        if (signError) throw signError;

        setUrl(data?.signedUrl ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not open this file"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file.storage_path, shouldFetch]);

  return { url, error, loading };
}

function FilePreview({ file, kind }: { file: ProjectFile; kind: FileKind }) {
  const needsUrl = kind !== "other";
  const { url, error, loading } = useSignedUrl(file, needsUrl);

  const tooLarge =
    (kind === "code" || kind === "text") &&
    (file.size_bytes ?? 0) > MAX_INLINE_PREVIEW_BYTES;

  if (kind === "other" || tooLarge) {
    return (
      <Unsupported
        reason={
          tooLarge
            ? `This file is ${formatFileSize(file.size_bytes)} — too large to preview inline.`
            : "No preview available for this file type."
        }
      />
    );
  }

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading preview...
      </p>
    );
  }

  if (error || !url) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-2 p-16 text-sm text-destructive"
      >
        <AlertCircle className="h-4 w-4" />
        {error ?? "Could not open this file"}
      </div>
    );
  }

  switch (kind) {
    case "image":
      return (
        <div className="flex items-center justify-center p-4">
          {/* Signed URL from private storage — Next's optimizer cannot fetch it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={file.name}
            className="max-h-[60vh] max-w-full object-contain"
          />
        </div>
      );

    case "video":
      return (
        <div className="flex items-center justify-center bg-black p-2">
          <video
            src={url}
            controls
            className="max-h-[60vh] max-w-full"
            aria-label={file.name}
          />
        </div>
      );

    case "audio":
      return (
        <div className="p-8">
          <audio src={url} controls className="w-full" aria-label={file.name} />
        </div>
      );

    case "pdf":
      return (
        <iframe
          src={url}
          title={file.name}
          className="h-[60vh] w-full border-0 bg-white"
        />
      );

    case "code":
    case "text":
      return (
        <CodeBlock
          url={url}
          language={kind === "code" ? prismLanguage(file.name) : "text"}
          plain={kind === "text"}
        />
      );

    default:
      return <Unsupported reason="No preview available for this file type." />;
  }
}

function Unsupported({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-16 text-center">
      <FileQuestion className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="max-w-xs text-sm text-muted-foreground">{reason}</p>
      <p className="text-xs text-muted-foreground">
        Use Download to open it locally.
      </p>
    </div>
  );
}

function DownloadButton({ file }: { file: ProjectFile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async () => {
    if (!file.storage_path) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKETS.FILES)
        .download(file.storage_path);

      if (downloadError) throw downloadError;
      if (!data) throw new Error("Empty response");

      const href = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }, [file]);

  return (
    <div className="ml-auto flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button size="sm" onClick={download} disabled={busy || !file.storage_path}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download
      </Button>
    </div>
  );
}
