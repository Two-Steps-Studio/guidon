import { createHmac, timingSafeEqual } from "node:crypto";

/** Slack's own limit: requests older than this are refused, so a captured one can't be replayed later. */
export const SLACK_MAX_AGE_SECONDS = 5 * 60;

/**
 * Verifies a request from Slack (https://api.slack.com/authentication/verifying-requests-from-slack):
 * `X-Slack-Signature` is "v0=" + hex HMAC-SHA256 of "v0:<timestamp>:<raw body>"
 * keyed by the app's signing secret, and `X-Slack-Request-Timestamp` must be
 * within five minutes of now. Works on the raw body - parsing it first and
 * re-encoding would change the bytes that were signed.
 *
 * No `server-only` marker, so tests/slack.test.mjs can import it directly.
 */
export function verifySlackSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  nowSeconds?: number;
}): boolean {
  const { rawBody, timestamp, signature, signingSecret } = input;
  if (!signingSecret || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > SLACK_MAX_AGE_SECONDS) return false;

  const expected = "v0=" + createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}
