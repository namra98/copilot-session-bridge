# Protocol

This protocol is implemented by the `session-send-bridge` Copilot CLI extension.

The bridge is an extension, not a plugin. It must be installed under either:

```text
~/.copilot/extensions/session-send-bridge/extension.mjs
```

or:

```text
.github/extensions/session-send-bridge/extension.mjs
```

Each Copilot session that loads the extension starts its own loopback endpoint and writes its own registry entry.

## Registry

Each bridge-enabled session writes:

```json
{
  "sessionId": "uuid",
  "bridgeUrl": "http://127.0.0.1:12345/send",
  "healthUrl": "http://127.0.0.1:12345/health",
  "token": "secret",
  "pid": 12345,
  "createdAt": "2026-06-30T00:00:00.000Z"
}
```

## Send request

```http
POST /send
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "prompt": "message text",
  "mode": "enqueue"
}
```

## Send response

```json
{
  "ok": true,
  "sessionId": "uuid",
  "messageId": "uuid",
  "mode": "enqueue"
}
```

## Health

```http
GET /health
```

```json
{
  "ok": true,
  "sessionId": "uuid",
  "bridgeUrl": "http://127.0.0.1:12345/send"
}
```

## Telex envelope suggestion

```text
[TELEX_MESSAGE v1]
message_id: <id>
from: <address>
to: <address>
subject: <subject>
attention: background|next-checkpoint|interrupt
requires_disposition: true|false

<body>

required_action:
- handle this message
- disposition message_id via telex ack/handle/defer/reject/etc.
[/TELEX_MESSAGE]
```
