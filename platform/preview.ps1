$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw 'Please install Python 3.11 or newer.' }
    & $python.Source -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment.' }
}
$venvPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
& $venvPython -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('openpyxl') else 1)"
if ($LASTEXITCODE -ne 0) {
    & $venvPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Could not install dependencies.' }
}
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$buildDirectory = Join-Path $repositoryRoot ('_site-preview-' + [DateTime]::Now.ToString('yyyyMMddHHmmssfff'))
& $venvPython build_static.py --output $buildDirectory
if ($LASTEXITCODE -ne 0) { throw 'The source table failed validation. See errors above.' }
$port = 8766
while ($port -lt 8790) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try { $listener.Start(); $listener.Stop(); break } catch { $listener.Stop(); $port++ }
}
if ($port -ge 8790) { throw 'No local preview port available.' }
$taskData = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Force -Path $taskData | Out-Null
$process = Start-Process -FilePath $venvPython -ArgumentList @('-m', 'http.server', $port, '--bind', '127.0.0.1') -WorkingDirectory $buildDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskData "preview-$port.log") -RedirectStandardError (Join-Path $taskData "preview-$port-error.log")
$url = "http://127.0.0.1:$port"
$running = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 200
    try { Invoke-WebRequest -Uri "$url/data/manifest.json" -UseBasicParsing -TimeoutSec 1 | Out-Null; $running = $true; break } catch { }
    if ($process.HasExited) { break }
}
if (-not $running) { throw 'Preview did not start. Check the preview error log.' }
Write-Host "Static preview: $url"
Write-Host "Local preview process ID: $($process.Id)"
Write-Host 'After changing source tables, run this launcher again to build a fresh preview.'
Start-Process $url
