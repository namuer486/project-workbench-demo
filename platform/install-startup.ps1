$ErrorActionPreference = 'Stop'
$taskStartup = [Environment]::GetFolderPath('Startup')
$taskShortcut = Join-Path $taskStartup 'ProjectWorkbench.lnk'
$taskShell = New-Object -ComObject WScript.Shell
$taskLink = $taskShell.CreateShortcut($taskShortcut)
$taskLink.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$taskLink.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'start.ps1') + '" -NoBrowser'
$taskLink.WorkingDirectory = $PSScriptRoot
$taskLink.WindowStyle = 7
$taskLink.Description = 'Start the local project workbench after Windows sign-in'
$taskLink.Save()
Write-Host "Installed current-user startup: $taskShortcut"
