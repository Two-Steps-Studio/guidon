import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Base64 and the MCP envelope must fit the production function response limit.
export const MAX_INLINE_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** Sniff supported image signatures instead of trusting an uploaded MIME label. */
export function attachmentImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0,6))) return "image/gif";
  if (bytes.length >= 12 && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP") return "image/webp";
  return null;
}

export function attachmentToolResult(bytes: Uint8Array, mimeType: string, uri: string): CallToolResult {
  if (bytes.byteLength > MAX_INLINE_ATTACHMENT_BYTES) return { content: [{ type: "text", text: "File exceeds the inline limit. Call get_task_attachment with mode=download." }], isError: true };
  const imageMime = attachmentImageMime(bytes);
  if (imageMime) return { content: [{ type: "image", mimeType: imageMime, data: Buffer.from(bytes).toString("base64") }] };
  // Unsupported image formats and binary documents stay inert embedded resources.
  const textType = /^(text\/(plain|markdown|csv)|application\/json)(;|$)/i.test(mimeType);
  if (textType) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return { content: [{ type: "resource", resource: { uri, mimeType, text } }] };
    } catch { /* Invalid UTF-8 remains a binary resource. */ }
  }
  return { content: [{ type: "resource", resource: { uri, mimeType, blob: Buffer.from(bytes).toString("base64") } }] };
}
