"use client";

import { useState, type ClipboardEvent, type DragEvent, type RefObject } from "react";
import { attachmentImageMarkdown, useTaskAttachments } from "@/components/work/task-attachments-context";

type TextField = HTMLTextAreaElement | HTMLInputElement;

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

/**
 * Clipboard screenshots arrive as a generic "image.png" - give them a
 * name that still means something in the attachment list a week later.
 */
function friendlyName(file: File): File {
  if (file.name && file.name !== "image.png") return file;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([file], `screenshot-${stamp}.${ext}`, { type: file.type });
}

/**
 * Paste (Ctrl/Cmd+V) or drop images into a task text field: each image is
 * uploaded as a task attachment and an `![name](attachment:<id>)` reference
 * goes where the cursor was - a stable id, not the signed URL, which
 * expires. While uploading, a placeholder holds its spot so typing can
 * continue; it's swapped for the real reference (or removed on failure).
 *
 * `update` must be a functional state setter: uploads finish after the user
 * may have kept typing, so the replacement has to apply to the latest text.
 */
export function useImagePaste({
  fieldRef,
  update,
  enabled,
  onError,
}: {
  fieldRef: RefObject<TextField | null>;
  update: (fn: (previous: string) => string) => void;
  enabled: boolean;
  onError: (message: string) => void;
}) {
  const { upload } = useTaskAttachments();
  const [uploading, setUploading] = useState(0);

  const insert = (files: File[]) => {
    const el = fieldRef.current;
    const tokens = files.map((file, i) => ({
      file: friendlyName(file),
      token: `![Uploading ${Date.now().toString(36)}-${i}…]()`,
    }));
    const insertion = tokens.map((t) => t.token).join("\n");

    update((previous) => {
      const start = el ? Math.min(el.selectionStart ?? previous.length, previous.length) : previous.length;
      const end = el ? Math.min(el.selectionEnd ?? start, previous.length) : start;
      const before = previous.slice(0, start);
      const after = previous.slice(end);
      // Images read best on their own line in a textarea; an <input> is single-line.
      const block = el instanceof HTMLTextAreaElement;
      const lead = block && before && !before.endsWith("\n") ? "\n" : "";
      const trail = block && after && !after.startsWith("\n") ? "\n" : block ? "" : " ";
      return `${before}${lead}${insertion}${trail}${after}`;
    });

    for (const { file, token } of tokens) {
      setUploading((n) => n + 1);
      void upload(file).then((result) => {
        setUploading((n) => n - 1);
        if (result.error || !result.attachment) {
          update((previous) => previous.replace(token, "").replace(/\n{3,}/g, "\n\n"));
          onError(result.error ?? "Upload failed.");
          return;
        }
        const attachment = result.attachment;
        update((previous) => previous.replace(token, attachmentImageMarkdown(attachment.name, attachment.id)));
      });
    }
  };

  const onPaste = (event: ClipboardEvent<TextField>) => {
    if (!enabled) return;
    const files = imageFiles(event.clipboardData?.files);
    if (files.length === 0) return; // plain text paste - leave it to the browser
    event.preventDefault();
    insert(files);
  };

  const onDragOver = (event: DragEvent<TextField>) => {
    if (enabled && event.dataTransfer?.types.includes("Files")) event.preventDefault();
  };

  const onDrop = (event: DragEvent<TextField>) => {
    if (!enabled) return;
    const files = imageFiles(event.dataTransfer?.files);
    if (files.length === 0) return;
    event.preventDefault();
    fieldRef.current?.focus();
    insert(files);
  };

  return { onPaste, onDragOver, onDrop, uploading: uploading > 0 };
}
