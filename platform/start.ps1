param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $env:WORKBENCH_REQUIRE_LOGIN) { $env:WORKBENCH_REQUIRE_LOGIN = '0' }
if ($env:WORKBENCH_REQUIRE_LOGIN -eq '0') { $env:WORKBENCH_HOST = '127.0.0.1' }
$port = if ($env:WORKBENCH_PORT) { $env:WORKBENCH_PORT } else { '8765' }
$url = "http://127.0.0.1:$port"
$running = $false
try {
    $health = Invoke-RestMethod -Uri "$url/healthz" -TimeoutSec 2
    $running = $health.service -eq 'project-workbench'
} catch { }
if (-not $running) {
    if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if (-not $python) { throw 'Please install Python 3.11 or newer, then run this launcher again.' }
        & $python.Source -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment.' }
    }
    $venvPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
    & $venvPython -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('openpyxl') else 1)"
    if ($LASTEXITCODE -ne 0) {
        & $venvPython -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the package mirror/network.' }
    }
    $taskData = if ($env:WORKBENCH_DATA) { $env:WORKBENCH_DATA } else { Join-Path $PSScriptRoot 'data' }
    New-Item -ItemType Directory -Force -Path $taskData | Out-Null
    $hostScript = Join-Path $PSScriptRoot 'host.ps1'
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"' + $hostScript + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try { $health = Invoke-RestMethod -Uri "$url/healthz" -TimeoutSec 1; if ($health.service -eq 'project-workbench') { $running = $true; break } } catch { }
        if ($process.HasExited) { break }
    }
    if (-not $running) { throw "Service did not start. See $taskData/server-error.log." }
}
$keyDirectory = if ($env:WORKBENCH_DATA) { $env:WORKBENCH_DATA } else { Join-Path $PSScriptRoot 'data' }
if ($env:WORKBENCH_REQUIRE_LOGIN -eq '0') { Write-Host 'Local mode: no login required.' } elseif (-not $env:WORKBENCH_ADMIN_KEY) {
    Write-Host 'Local admin key:'
    Get-Content -LiteralPath (Join-Path $keyDirectory 'admin.key')
} else { Write-Host 'Use the admin key from WORKBENCH_ADMIN_KEY.' }
Write-Host "Workbench: $url"
if (-not $NoBrowser) { Start-Process $url }
