[CmdletBinding()]
param(
  [switch]$BuildOnly,
  [switch]$Upload,
  [string]$Tag
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Set-Location -Path $PSScriptRoot

function Assert-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Read-Version {
  $confPath = Join-Path $PSScriptRoot 'apps/desktop/src-tauri/tauri.conf.json'
  if (-not (Test-Path $confPath)) {
    throw "Version file not found: $confPath"
  }

  $conf = Get-Content -Path $confPath -Raw | ConvertFrom-Json
  if (-not $conf.version) {
    throw "Could not read version from $confPath"
  }

  return [string]$conf.version
}

function Collect-Artifacts {
  param([Parameter(Mandatory = $true)][string]$BundleDir)

  $patterns = @(
    'msi/*.msi',
    'nsis/*.exe',
    'updater/*.zip',
    'updater/*.tar.gz'
  )

  $items = @()
  foreach ($pattern in $patterns) {
    $path = Join-Path $BundleDir $pattern
    $items += Get-ChildItem -Path $path -File -ErrorAction SilentlyContinue
  }

  return $items | Sort-Object FullName -Unique
}

if ($BuildOnly -and $Upload) {
  throw 'Use only one of -BuildOnly or -Upload.'
}

$version = Read-Version
$resolvedTag = if ($Tag) { $Tag } else { "v$version" }

Write-Host "==> Building itman $resolvedTag on Windows"

Assert-Command -Name 'pnpm'

Write-Host '==> Installing dependencies...'
pnpm install --frozen-lockfile

Write-Host '==> Running tauri build...'
pnpm --filter @itman/desktop tauri build

$bundleDir = Join-Path $PSScriptRoot 'target/release/bundle'
$artifacts = Collect-Artifacts -BundleDir $bundleDir

if (-not $artifacts -or $artifacts.Count -eq 0) {
  throw "No build artifacts found in $bundleDir"
}

Write-Host '==> Artifacts:'
$artifacts | ForEach-Object { Write-Host "    $($_.FullName)" }

if ($BuildOnly -or -not $Upload) {
  Write-Host '==> Build-only mode complete.'
  exit 0
}

Assert-Command -Name 'gh'
Write-Host "==> Uploading artifacts to GitHub release $resolvedTag..."

$releaseExists = $true
try {
  gh release view $resolvedTag *> $null
}
catch {
  $releaseExists = $false
}

if (-not $releaseExists) {
  gh release create $resolvedTag --title "itman $resolvedTag" --generate-notes
}

$artifactPaths = $artifacts | ForEach-Object { $_.FullName }
gh release upload $resolvedTag @artifactPaths --clobber

$url = gh release view $resolvedTag --json url --jq '.url'
Write-Host "==> Done! Release: $url"
