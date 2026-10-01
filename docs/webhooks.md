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
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Python:

```python
import hashlib, hmac, time

def verify_guidon_webhook(raw_body: bytes, headers, secret: str) -> bool:
    timestamp = headers.get("X-Guidon-Timestamp", "")
    signature = headers.get("X-Guidon-Signature", "")
    if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > 300:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Delivery rules

- One attempt per event, sent right after the change is saved. There are no automatic retries - use **Test** to check the endpoint, and treat webhooks as notifications rather than a guaranteed log (the API at `/api/v1` is the source of truth).
- The receiver has 5 seconds to answer. Any `2xx` counts as delivered.
- Redirects are not followed; use the final URL.
- The result of the latest delivery (time, HTTP status, error) is shown next to each webhook.
- **Guidon Cloud:** the URL must be `https://` and resolve to a public address - `localhost`, private networks and cloud metadata addresses are refused, both when saving and before every delivery.
- **Self-hosted:** `http://` and internal addresses are allowed, since reaching your own network is usually the point.
- At most 10 webhooks per organization.
