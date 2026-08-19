"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  Download,
  File,
  FileText,
  Image,
  Loader2,
  MoreVertical,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { FileViewer } from "@/components/files/file-viewer";
import type { ProjectFile } from "@/types/api";
import { deleteFile, getDownloadUrl, uploadFile, type FileActionState } from "./actions";

const FILE_TYPE_ICONS: Record<string, LucideIcon> = {
  "application/pdf": FileText,
  "image/": Image,
  "text/": FileText,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  "application/pdf": "bg-red-100 text-red-800",
  "image/": "bg-blue-100 text-blue-800",
  "text/": "bg-green-100 text-green-800",
  "audio/": "bg-purple-100 text-purple-800",
  "video/": "bg-orange-100 text-orange-800",
};

function getFileIcon(mimeType: string): LucideIcon {
  for (const [prefix, Icon] of Object.entries(FILE_TYPE_ICONS)) {
    if (mimeType.startsWith(prefix)) return Icon;
  }
  return File;
}

function getFileColor(mimeType: string): string {
  for (const [prefix, color] of Object.entries(FILE_TYPE_COLORS)) {
    if (mimeType.startsWith(prefix)) return color;
  }
  return "bg-gray-100 text-gray-800";
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const initialUploadState: FileActionState = { error: null };

export function FilesBrowser({
  projectId,
  files,
  canWrite,
  canManage,
}: {
  projectId: string;
  files: ProjectFile[];
  canWrite: boolean;
  canManage: boolean;
}) {
  const uploadWithProject = uploadFile.bind(null, projectId);
  const [uploadState, uploadAction, uploading] = useActionState(uploadWithProject, initialUploadState);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitFile = (file: File) => {
    const data = new FormData();
    data.set("file", file);
    uploadAction(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) submitFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) submitFile(file);
  };

  useEffect(() => {
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [uploading]);

  return (
    <>
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Files</h1>
          <p className="text-muted-foreground">Project documents and assets</p>
        </div>
        {canWrite && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              accept=".txt,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.mp4,.webm"
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {uploadState.error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {uploadState.error}
        </div>
      )}

      {canWrite && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          className={`mb-6 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag and drop files here, or click the upload button
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Supported: .txt, .md, .pdf, images, audio, video
          </p>
        </div>
      )}

      {files.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No files yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Upload project documents and assets
            </p>
            {canWrite && (
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <FileCard
              key={file.id}
              projectId={projectId}
              file={file}
              canManage={canManage}
              onPreview={() => setPreviewFile(file)}
            />
          ))}
        </div>
      )}

      <FileViewer file={previewFile} files={files} onClose={() => setPreviewFile(null)} onNavigate={setPreviewFile} />
    </>
  );
}

function FileCard({
  projectId,
  file,
  canManage,
  onPreview,
}: {
  projectId: string;
  file: ProjectFile;
  canManage: boolean;
  onPreview: () => void;
}) {
  /* eslint-disable react-hooks/static-components -- getFileIcon returns a
     stable reference from a module-level lookup table (FILE_TYPE_ICONS), not
     a freshly constructed component, so this is safe despite the lint rule's
     static analysis being unable to prove it. */
  const Icon = getFileIcon(file.mime_type || "");
  const colorClass = getFileColor(file.mime_type || "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDownload = () => {
    if (!file.storage_path) return;
    startTransition(async () => {
      const result = await getDownloadUrl(projectId, file.id);
      if (result.url) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteFile(projectId, file.id);
      setError(result.error);
    });
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div
            role="button"
            tabIndex={0}
            aria-label={`Preview ${file.name}`}
            onClick={onPreview}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPreview();
              }
            }}
            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Icon className="h-5 w-5" />
              {/* eslint-enable react-hooks/static-components */}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-medium truncate">{file.name}</CardTitle>
              <CardDescription className="text-xs">{formatFileSize(file.size_bytes || 0)}</CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </DropdownMenuItem>
              {canManage && (
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <p className="text-xs text-destructive mb-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{file.mime_type}</span>
          <span>{new Date(file.created_at).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
