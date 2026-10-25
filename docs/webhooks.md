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

- One attempt per event, sent right after the change is saved. There are no automatic retries - use **Test** to check the endpoint, and treat webhooks as notifications rather than a guaranteed log (the API at `/api/v1` is the source of truth).
- Each HTTP request has a 5-second total deadline covering connection-time DNS, connection setup and response reads. Incoming bytes do not extend the deadline. The preliminary DNS validation happens separately before the request and is not covered by this timer. A completed `2xx` counts as delivered; a connection cut short or a deadline expiry is a failure. Response bodies are intentionally capped (2,000 bytes), so reaching that cap ends the read successfully using the received status.
- Redirects are not followed; use the final URL.
- The result of the latest delivery (time, HTTP status, error) is shown next to each webhook.
- **Guidon Cloud:** the URL must be `https://` and resolve to a public address - `localhost`, private networks and cloud metadata addresses are refused, both when saving and before every delivery.
- **Self-hosted:** `http://` and internal addresses are allowed, since reaching your own network is usually the point.
- At most 10 webhooks per organization.

## Failure and retry limitations

`429`, `5xx`, timeout and connection failures are recorded as failures; they do
not currently schedule a retry, even if `Retry-After` is present. A successful
task mutation is not rolled back when a notification fails. The `after()` work
is limited by the hosting platform's function lifetime, and only the latest
result is stored, not a durable event/delivery history. There is no durable
outbox, guaranteed ordering, replay endpoint or exactly-once guarantee.

Durable retries and their queue/idempotency/tenant-isolation tests belong to the
separate Reliability task. Until that is implemented, reconcile important state
through the API and monitor the latest delivery result. The **Test** action
sends a new ping; it does not replay a failed task event.

## Local verification

`npm run test:webhooks` covers URL/address rules, HMAC and documented receiver
verification, native Discord/Slack bodies, local HTTP success/error responses,
redirect refusal, response caps, interrupted responses and total deadlines.
HTTP receivers bind only to loopback; native chat delivery is stubbed. DNS
fixtures are deterministic and do not query public DNS.

References: [Node HTTP timeout semantics](https://nodejs.org/api/http.html#requestsettimeouttimeout-callback)
and [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
