# Compatibility entry: the shared positive publication policy is authoritative.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
python (Join-Path $root 'scripts/release.py') android
if ($LASTEXITCODE -ne 0) { throw 'Release failed' }
