# Bump Chrome extension version in manifest.json
# - Increments the last numeric component (4th). Rolls over at 65535 and carries to previous components.
# - Updates version_name with ISO UTC timestamp for traceability.

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'manifest.json'

if (!(Test-Path $manifestPath)) {
    Write-Error "manifest.json not found at: $manifestPath"
}

# Read and parse manifest
$manifestRaw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
$manifest = $manifestRaw | ConvertFrom-Json

if (-not $manifest.version) {
    $manifest.version = '1.0.0.0'
}

# Parse version into 4 components
$parts = ($manifest.version -split '\.') | ForEach-Object { [int]$_ }
while ($parts.Count -lt 4) { $parts += 0 }

[int]$a = $parts[0]
[int]$b = $parts[1]
[int]$c = $parts[2]
[int]$d = $parts[3]

# Increment with carry and 65535 cap per Chrome rules
$d++
if ($d -gt 65535) { $d = 0; $c++ }
if ($c -gt 65535) { $c = 0; $b++ }
if ($b -gt 65535) { $b = 0; $a++ }

$manifest.version = "$a.$b.$c.$d"

# Update version_name with UTC timestamp
$utc = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$manifest.version_name = "v$($manifest.version) $utc"

# Write back pretty JSON
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "Bumped version to $($manifest.version)"
