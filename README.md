# Copilot Session Bridge

Loopback bridge for sending messages into active GitHub Copilot CLI sessions via the Copilot SDK.

## What it does

This extension makes each Copilot CLI session that loads it externally messageable:

1. The extension calls `joinSession()` inside the target Copilot session.
2. It starts a local loopback HTTP endpoint on `127.0.0.1`.
3. It writes a registry entry under `~/.copilot/session-send-bridge/<sessionId>.json`.
4. External tools can POST `{ prompt, mode }` to the bridge.
5. The bridge calls `session.send({ prompt, mode })`.

`mode` supports:

- `enqueue` — add to the normal session queue; safest default.
- `immediate` — interject during an in-progress turn; use only for true interrupts.

## Install

### User extension install

PowerShell:

```powershell
git clone https://github.com/namra98/copilot-session-bridge.git
cd copilot-session-bridge
.\scripts\Install-UserExtension.ps1
```

Restart or reload Copilot CLI extensions in any target session.

### Project extension install

Copy `extensions/session-send-bridge/` to a repository:

```text
.github/extensions/session-send-bridge/extension.mjs
```

Copilot CLI will load project extensions for sessions in that repository.

## Discover bridge-enabled sessions

```powershell
Get-ChildItem "$HOME\.copilot\session-send-bridge\*.json" |
  ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json } |
  Format-Table sessionId, bridgeUrl, pid, createdAt
```

## Send a message

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
  "sessionId": "...",
  "messageId": "...",
  "mode": "enqueue"
}
```

## Security

- The bridge binds only to `127.0.0.1`.
- Each session gets a random bearer token.
- Treat the registry token as sensitive.
- Restart/reload the session to rotate the token.

## What this is not

- Not a PID transport. PID is only metadata.
- Not `copilot --resume`; resume reopens a persisted session but does not inject into a live process.
- Not a global daemon. This is one bridge process per Copilot session that loads the extension.
- Not `--ui-server`. The per-session extension path uses `joinSession()` over the extension stdio connection.

## Telex / Streamliner fit

This is intended as the Copilot-side bridge for push delivery:

```text
external event
  -> resolve target session's registry entry
  -> POST /send
  -> session.send({ mode: "enqueue" })
  -> Copilot session handles the message
```

Classic polling/waiters can remain a fallback, but should not be the primary delivery path when a bridge is available.

