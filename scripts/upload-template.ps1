param(
    [Parameter(Mandatory)][string]$ScaffoldDir,
    [string]$Version = "0.1.0"
)

$Tarball = "crabyard-${Version}.tar.gz"
$TempFile = Join-Path $env:TEMP $Tarball
$ApiUrl = $env:API_URL
$AdminKey = $env:ADMIN_KEY

if (-not $ApiUrl) { throw "Set API_URL env var (e.g. https://api.crabyard.dev)" }
if (-not $AdminKey) { throw "Set ADMIN_KEY env var" }

Write-Host "Packaging scaffold from ${ScaffoldDir}..."

if (Test-Path $TempFile) { Remove-Item $TempFile -Force }

Push-Location $ScaffoldDir
tar -czf $TempFile `
    --exclude='.git' `
    --exclude='node_modules' `
    --exclude='target' `
    --exclude='.claude' `
    --exclude='MEMORY.md' `
    base auth ui manifest.toml
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $TempFile)) {
    Pop-Location
    throw "tar failed to create $TempFile"
}
Pop-Location

$ApiUrl = $ApiUrl.TrimEnd("/")
if ($ApiUrl -notmatch '^https://') {
    $ApiUrl = "https://$($ApiUrl -replace '^https?://', '')"
}

Write-Host "Uploading to API as v${Version}..."
Invoke-RestMethod `
    -Method Post `
    -Uri "${ApiUrl}/template/upload?version=${Version}" `
    -Headers @{ "X-Admin-Key" = $AdminKey } `
    -ContentType "application/gzip" `
    -InFile $TempFile

Write-Host "Done - template v${Version} uploaded."
Remove-Item $TempFile
