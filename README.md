# Copilot Session Bridge

Make active GitHub Copilot CLI sessions externally messageable.

This repository contains a **Copilot CLI extension**. It is not a Copilot plugin and it does not require a plugin marketplace. The extension is a small Node.js process that Copilot CLI starts for each session that loads it. It attaches to that session with the Copilot SDK and exposes a local loopback HTTP endpoint for sending messages into the session.

## Why this exists

When multiple Copilot CLI sessions are running, an external coordinator such as Telex, Streamliner, or a local script often needs to notify a specific session:

- a worker finished;
- another agent needs a decision;
- a durable inbox has a message;
- an orchestrator should reconcile new state.

Plain `copilot --resume <session>` is not enough for this. It reopens a persisted session, but it does not provide a live message API for an already-running process. A PID is also not enough; it identifies a process, not a message transport.

The Copilot SDK does provide the right primitive once code is running inside or connected to the session:

```js
await session.send({ prompt: "...", mode: "enqueue" });
```

This extension turns that primitive into a local bridge.

## How it works

For every Copilot session that loads the extension:

1. Copilot CLI forks `extension.mjs` as a child process.
2. The extension calls `joinSession()` from `@github/copilot-sdk/extension`.
3. `joinSession()` attaches to the current foreground Copilot session over JSON-RPC/stdio.
4. The extension starts a tiny HTTP server bound to `127.0.0.1` on a random free port.
5. The extension writes a registry file under `~/.copilot/session-send-bridge/`.
6. External tools read the registry and POST messages to the bridge.
7. The bridge calls `session.send({ prompt, mode })`.

Process shape:

```text
Windows Terminal tab
  └─ copilot.exe
       └─ session-send-bridge extension process
            ├─ joinSession() over stdio JSON-RPC to parent Copilot CLI
            └─ HTTP server on 127.0.0.1:<random-port>
```

External sender:

```text
script / Telex / Streamliner
  -> read ~/.copilot/session-send-bridge/<sessionId>.json
  -> POST /send
  -> extension calls session.send()
  -> target Copilot session receives queued message
```

## Extension vs plugin

This project uses the Copilot CLI **extension** system:

```text
~/.copilot/extensions/session-send-bridge/extension.mjs
```

or project-local:

```text
.github/extensions/session-send-bridge/extension.mjs
```

Extensions are not plugins. They are local `.mjs` files that Copilot CLI discovers and runs. The bridge intentionally uses that extension path directly.

## Install

Clone the repository and install as a user extension:

```powershell
git clone https://github.com/namra98/copilot-session-bridge.git
cd copilot-session-bridge
.\scripts\Install-UserExtension.ps1
```

This copies:

```text
extensions/session-send-bridge/extension.mjs
```

to:

```text
~/.copilot/extensions/session-send-bridge/extension.mjs
```

Restart Copilot CLI sessions or reload extensions. Future sessions should load the user extension automatically when user extensions are enabled.

## Project-local install

To make only one repository load the bridge, copy the extension into that repository:

```text
<repo>/.github/extensions/session-send-bridge/extension.mjs
```

Project extensions are useful when the bridge should travel with a repo/workstream rather than be enabled for all user sessions.

## Confirm the bridge loaded

When loaded, the extension writes a registry file:

```powershell
Get-ChildItem "$HOME\.copilot\session-send-bridge\*.json"
```

Example registry entry:

```json
{
  "sessionId": "a9f2ecd2-dc6e-4a0c-b795-02882c616b1b",
  "bridgeUrl": "http://127.0.0.1:59518/send",
  "healthUrl": "http://127.0.0.1:59518/health",
  "token": "...",
  "pid": 65460,
  "createdAt": "2026-06-30T17:37:36.000Z"
}
```

The extension also registers a tool in the session:

```text
session_send_bridge_info
```

Ask the target session to call that tool if you want it to print its bridge information.

## Send a message

Use the helper:

```powershell
.\scripts\Send-BridgeMessage.ps1 `
  -SessionId "<session-id>" `
  -Prompt "[EXTERNAL_MESSAGE] hello" `
  -Mode enqueue
```

Or call the bridge directly:

```powershell
$j = Get-Content "$HOME\.copilot\session-send-bridge\<sessionId>.json" -Raw | ConvertFrom-Json

Invoke-RestMethod `
  -Method Post `
  -Uri $j.bridgeUrl `
  -Headers @{ Authorization = "Bearer $($j.token)" } `
  -ContentType "application/json" `
  -Body (@{
    prompt = "[EXTERNAL_MESSAGE] hello"
    mode = "enqueue"
  } | ConvertTo-Json)
```

Expected response:

```json
{
  "ok": true,
  "sessionId": "a9f2ecd2-dc6e-4a0c-b795-02882c616b1b",
  "messageId": "bd93817b-92c9-4f6a-8434-e57b42c6c5c0",
  "mode": "enqueue"
}
```

## Delivery modes

| Mode | Meaning | Use |
|---|---|---|
| `enqueue` | Add a message to the normal session queue. If the agent is busy, it is processed after the current turn. | Default |
| `immediate` | Interject during the in-progress turn. | True interrupts/blockers only |

Use `enqueue` unless you are intentionally steering an active turn.

## Security model

- The HTTP server binds only to `127.0.0.1`.
- Each session gets a random bearer token.
- The token is stored in the local registry file for local automation.
- Treat the token as sensitive.
- Restart/reload the session to rotate the token.
- Delete stale registry files if a session exits without cleanup.

## What this does not do

- It does not make every historical Copilot session messageable retroactively.
- It does not use PID as a transport.
- It does not rely on `copilot --resume`.
- It does not require `--ui-server`.
- It does not replace Copilot-managed `write_agent` for background subagents.
- It does not replace Telex; it is a Copilot-side delivery bridge Telex can call.

## Existing plain sessions

An existing plain terminal session launched before this extension was installed might not have the bridge loaded. To make it messageable:

1. Reload extensions inside that session if supported.
2. Or restart/resume the session after installing the user extension.
3. Or install the extension project-locally and start a new session in that repo.

Once the session loads the extension, a registry entry appears under:

```text
~/.copilot/session-send-bridge/
```

## Telex integration sketch

```text
Telex message arrives
  -> resolve target Copilot session bridge registry entry
  -> POST /send with rendered Telex envelope
  -> bridge calls session.send({ prompt, mode: "enqueue" })
  -> Copilot session handles the message
  -> Copilot session dispositions/acks in Telex
```

Suggested message envelope:

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

Map Telex attention to bridge mode:

| Telex attention | Bridge mode |
|---|---|
| `background` | `enqueue` |
| `next-checkpoint` | `enqueue` |
| `interrupt` | usually `enqueue`; use `immediate` only when intentional |

