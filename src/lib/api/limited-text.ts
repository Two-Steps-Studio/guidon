type LimitedTextResult =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413 };

/** Read a small request without trusting its optional Content-Length header. */
export async function readLimitedText(request: Request, maxBytes: number): Promise<LimitedTextResult> {
  if (Number(request.headers.get("content-length")) > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { ok: true, text: text + decoder.decode() };
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        // The response should not wait for the sender to finish its upload.
        void reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}
