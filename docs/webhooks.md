# Organization webhooks

Guidon can notify your own services when tasks change. Owners and admins of an
organization add webhooks under **Organization → Settings → Webhooks**; each one
receives events from every project in that organization.

## Events

| Event | Sent when |
|---|---|
| `task.created` | A top-level task is created (web app, API, plugins, MCP). Subtasks don't trigger it. |
| `task.status_changed` | A task moves to another board column. |
| `task.completed` | A task moves to **Done**. A webhook subscribed only to `task.status_changed` receives this as a `task.status_changed` with `"status": "done"` instead, so it never misses finished tasks. |
| `ping` | You press **Test** next to the webhook. Always sent, whatever the subscription. |

## Request

`POST` to your URL with a JSON body:

```json
{
  "id": "5f0c6c1e-8d5b-4c55-9a0e-3f4d2b1c9e77",
  "type": "task.status_changed",
  "created_at": "2026-09-30T15:32:04.000Z",
  "organization_id": "…",
  "project": { "id": "…", "name": "Space Game" },
  "actor_id": "…",
  "data": {
    "task": {
      "id": "…",
      "title": "Fix door collision",
      "status": "review",
      "url": "https://useguidon.com/projects/…/work"
    }
  }
}
```

`data.task.status` is absent on `task.created`. A `ping` carries `data.webhook_id` instead of a task.

Headers:

| Header | Value |
|---|---|
| `X-Guidon-Event` | The event type, same as `type` in the body. |
| `X-Guidon-Delivery` | Unique id of this delivery, same as `id` in the body. |
| `X-Guidon-Timestamp` | Unix time (seconds) the request was signed. |
| `X-Guidon-Signature` | `sha256=` + hex HMAC-SHA256 of `"<timestamp>.<raw body>"` with the webhook's signing secret. |
| `User-Agent` | `Guidon-Webhooks/1.0` |

## Discord and Slack

Point a webhook straight at a **Discord** channel webhook
(`https://discord.com/api/webhooks/…`) or a **Slack** incoming webhook
(`https://hooks.slack.com/services/…`) and Guidon sends a native chat message
instead of the JSON above - an embed with the task title, link, new status and
project on Discord, a one-line message with a link on Slack. The format is
picked from the URL; the settings page marks such webhooks with a
Discord/Slack badge. Both services reject the plain JSON envelope with HTTP 400,
which is what you'd see in "Last delivery" before this.

When a receiver answers with an error, "Last delivery" shows the first line of
its response (e.g. Discord's `Cannot send an empty message`), not just the
status code.

## Verifying the signature

The signing secret (`whsec_…`) is shown once, when the webhook is created. Verify
every request against the **raw** body before parsing it, and reject old
timestamps so a captured request can't be replayed.

Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyGuidonWebhook(rawBody, headers, secret) {
  const timestamp = headers["x-guidon-timestamp"];
  const signature = headers["x-guidon-signature"] ?? "";
  if (typeof timestamp !== "string" || !/^\d{1,16}$/.test(timestamp)) return false;
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Python:

```python
import hashlib, hmac, re, time

def verify_guidon_webhook(raw_body: bytes, headers, secret: str) -> bool:
    timestamp = headers.get("X-Guidon-Timestamp", "")
    signature = headers.get("X-Guidon-Signature", "")
    if not isinstance(timestamp, str) or not timestamp.isascii() or not timestamp.isdigit() or len(timestamp) > 16:
        return False
    if not isinstance(signature, str) or not re.fullmatch(r"sha256=[a-f0-9]{64}", signature):
        return False
    if abs(time.time() - int(timestamp)) > 300:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

The timestamp check accepts at most five minutes of clock difference in either
direction. It does not stop a valid delivery being replayed within that window:
after verifying the signature, atomically remember the signed envelope's `id`
and process each id only once for that webhook. For Discord/Slack the native
body does not include the envelope id; use the verified signature and timestamp
as the short-lived duplicate key instead of trusting an unsigned id header.

## Web Bot Auth signature (optional)

When the server has `WEB_BOT_AUTH_PRIVATE_KEY` set, every delivery also carries an [HTTP Message Signature](https://www.rfc-editor.org/rfc/rfc9421) in the [Web Bot Auth](https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture/) form: `Signature-Agent`, `Signature-Input` (covering `@authority` and `signature-agent`, `tag="web-bot-auth"`, a five-minute lifetime) and `Signature` (Ed25519). The public key is at `<origin>/.well-known/http-message-signatures-directory`, looked up by the `keyid` (a JWK thumbprint).

It proves the request comes from that Guidon server without sharing a secret - useful to a CDN or firewall in front of your receiver. It doesn't cover the body; `X-Guidon-Signature` still does that.

## Delivery rules

- Every event for every webhook is queued (migration `089_webhook_deliveries.sql`) and the first attempt is sent right after the change is saved.
- **Retries.** A failure a retry can fix - no response (connection error, timeout), `408`, `429` or `5xx` - is sent again after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours: six attempts over about 15 hours, then the delivery is marked failed. Other `4xx` answers, refused addresses and redirects fail at once, since sending the same request again won't change them. `Retry-After` is not read yet.
- **Same id on every attempt.** `id` in the body and `X-Guidon-Delivery` stay the same across retries of one event (as does `created_at`), so a receiver can ignore a delivery it has already processed. A retry is signed again with a fresh `X-Guidon-Timestamp`.
- **History.** Each webhook has a **Delivery history** in Organization → Settings → Webhooks: the latest 20 deliveries, their attempts, the receiver's last status or error, when the next retry is due, and **Retry** to send one again right away. Finished deliveries are kept for 30 days.
- **When retries go out.** Due retries are sent after every new event, by **Retry**, and by `GET /api/cron/webhooks` with `Authorization: Bearer $CRON_SECRET`. Call that every few minutes so retries don't wait for the next event - Vercel Cron sends the header by itself when `CRON_SECRET` is set; on a self-hosted server use crontab. Without `CRON_SECRET` the endpoint answers 503 and retries go out only with new events and **Retry**.
- A retry goes to the webhook as it is now: a changed URL or secret is used, and a webhook that was turned off or deleted gets nothing more.
- Each HTTP request has a 5-second total deadline covering connection-time DNS, connection setup and response reads. Incoming bytes do not extend the deadline. A completed `2xx` counts as delivered; a connection cut short or a deadline expiry is a failure. Response bodies are capped (2,000 bytes), so reaching that cap ends the read using the received status.
- Redirects are not followed; use the final URL.
- The result of the latest attempt (time, HTTP status, error) is also shown next to each webhook.
- **Guidon Cloud:** the URL must be `https://` and resolve to a public address - `localhost`, private networks and cloud metadata addresses are refused, both when saving and before every attempt (and again when connecting).
- **Self-hosted:** `http://` and internal addresses are allowed, since reaching your own network is usually the point.
- At most 10 webhooks per organization.

## Guarantees and limits

Delivery is at least once: a receiver can get the same `id` more than once (a retry after a response that was lost on the way back) and should treat repeats as no-ops. There is no ordering guarantee between events - a retried older event can arrive after a newer one; use `created_at` and the API at `/api/v1` as the source of truth for current state. A task change is never rolled back because a webhook failed. **Test** sends a new `ping` straight away; it isn't queued or retried.

## Local verification

`npm run test:webhooks` covers URL/address rules, HMAC and documented receiver
verification, native Discord/Slack bodies, local HTTP success/error responses,
redirect refusal, response caps, interrupted responses and total deadlines.
HTTP receivers bind only to loopback; native chat delivery is stubbed. DNS
fixtures are deterministic and do not query public DNS.

References: [Node HTTP timeout semantics](https://nodejs.org/api/http.html#requestsettimeouttimeout-callback)
and [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
