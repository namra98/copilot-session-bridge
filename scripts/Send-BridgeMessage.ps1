#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SessionId,

  [Parameter(Mandatory = $true)]
  [string]$Prompt,

  [ValidateSet("enqueue", "immediate")]
  [string]$Mode = "enqueue",

  [string]$RegistryDir = (Join-Path $HOME ".copilot\session-send-bridge")
)

$ErrorActionPreference = "Stop"

$entryPath = Join-Path $RegistryDir "$SessionId.json"
if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
  throw "No bridge registry entry found for session $SessionId at $entryPath"
}

$entry = Get-Content -LiteralPath $entryPath -Raw | ConvertFrom-Json
$body = @{
  prompt = $Prompt
  mode = $Mode
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri $entry.bridgeUrl `
  -Headers @{ Authorization = "Bearer $($entry.token)" } `
  -ContentType "application/json" `
  -Body $body

