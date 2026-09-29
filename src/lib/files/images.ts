/**
 * Helpers for images coming from the clipboard, drag-and-drop or a file
 * picker. Pure - no DOM access beyond the File/FileList they're given.
 */

/** Only the image files out of a FileList (clipboard, drop or <input type="file">). */
export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

/**
 * Clipboard screenshots arrive as a generic "image.png" - give them a name
 * that still means something in a file list a week later
 * (`<prefix>-20260929-141530.png`). Real file names are kept as they are.
 */
export function withReadableName(file: File, prefix: string): File {
  if (file.name && file.name !== "image.png") return file;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([file], `${prefix}-${stamp}.${ext}`, { type: file.type });
}
