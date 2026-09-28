# Keeps the local backend running while this Windows user remains signed in.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskData = if ($env:WORKBENCH_DATA) { $env:WORKBENCH_DATA } else { Join-Path $PSScriptRoot 'data' }
$port = if ($env:WORKBENCH_PORT) { $env:WORKBENCH_PORT } else { '8765' }
$mutex = New-Object System.Threading.Mutex($false, "Local\ProjectWorkbenchHost-$port")
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    New-Item -ItemType Directory -Force -Path $taskData | Out-Null
    $PID | Set-Content -LiteralPath (Join-Path $taskData 'host.pid')
    $taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
    while ($true) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/healthz" -TimeoutSec 2
            if ($health.service -eq 'project-workbench') { Start-Sleep -Seconds 10; continue }
        } catch { }
        $child = Start-Process -FilePath $taskPython -ArgumentList 'server.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskData 'server.log') -RedirectStandardError (Join-Path $taskData 'server-error.log')
        $child.Id | Set-Content -LiteralPath (Join-Path $taskData 'server.pid')
        $child.WaitForExit()
        Start-Sleep -Seconds 5
    }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
