#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$SourceDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "extensions\session-send-bridge"),
  [string]$TargetDir = (Join-Path $HOME ".copilot\extensions\session-send-bridge")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath (Join-Path $SourceDir "extension.mjs") -PathType Leaf)) {
  throw "Source extension.mjs not found under $SourceDir"
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
Copy-Item -LiteralPath (Join-Path $SourceDir "extension.mjs") -Destination (Join-Path $TargetDir "extension.mjs") -Force

Write-Host "Installed session-send-bridge to $TargetDir"
Write-Host "Restart Copilot CLI sessions or reload extensions to activate it."

