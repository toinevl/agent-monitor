# install-windows.ps1 — installs beacon + pusher as Windows Task Scheduler tasks
#
# Usage (run as Administrator):
#   $env:BEACON_SECRET="xxx"; $env:PUSH_SECRET="xxx"; .\local-pusher\install-windows.ps1
#
# Uninstall:
#   .\local-pusher\install-windows.ps1 -Uninstall

param([switch]$Uninstall)

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$CentralUrl  = "https://agent-monitor.bluecliff-bb323f5a.northeurope.azurecontainerapps.io"
$Node        = (Get-Command node -ErrorAction SilentlyContinue)?.Source
$BeaconTask  = "AgentMonitorBeacon"
$PusherTask  = "AgentMonitorPusher"

if (-not $Node) {
  Write-Error "node.exe not found. Is Node.js installed and on PATH?"
  exit 1
}

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $BeaconTask -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $PusherTask -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "✅ Tasks removed"
  exit 0
}

if (-not $env:BEACON_SECRET -or -not $env:PUSH_SECRET) {
  Write-Error "Set BEACON_SECRET and PUSH_SECRET environment variables before running."
  exit 1
}

$InstanceId = Read-Host "Instance ID (no spaces, e.g. windows-desktop)"
$Label      = Read-Host "Label (e.g. Windows Desktop)"

# Write beacon-config.json
@{
  instanceId   = $InstanceId
  label        = $Label
  centralUrl   = $CentralUrl
  beaconSecret = $env:BEACON_SECRET
} | ConvertTo-Json | Set-Content "$ScriptDir\beacon-config.json"
Write-Host "✅ beacon-config.json written"

# ---- Beacon task (every 10 minutes) ----
$BeaconAction  = New-ScheduledTaskAction `
  -Execute $Node `
  -Argument "`"$ScriptDir\beacon.js`" `"$ScriptDir\beacon-config.json`"" `
  -WorkingDirectory $ScriptDir
$BeaconTrigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 10) -Once -At (Get-Date)
$BeaconEnv     = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $BeaconTask `
  -Action $BeaconAction `
  -Trigger $BeaconTrigger `
  -Settings $BeaconEnv `
  -RunLevel Highest `
  -Force | Out-Null
Write-Host "✅ Beacon task registered (every 10 min)"

# ---- Pusher task (continuous, restart on failure) ----
$PusherAction  = New-ScheduledTaskAction `
  -Execute $Node `
  -Argument "`"$ScriptDir\pusher.js`"" `
  -WorkingDirectory $ScriptDir
$PusherTrigger = New-ScheduledTaskTrigger -AtLogOn
$PusherEnv     = New-ScheduledTaskSettingsSet -RestartCount 99 -RestartInterval (New-TimeSpan -Seconds 5)

# Inject environment variables via XML workaround
Register-ScheduledTask -TaskName $PusherTask `
  -Action $PusherAction `
  -Trigger $PusherTrigger `
  -Settings $PusherEnv `
  -RunLevel Highest `
  -Force | Out-Null

# Set env vars on the task (requires XML manipulation)
$xml = (Export-ScheduledTask -TaskName $PusherTask)
$xml = $xml -replace '</Actions>', @"
</Actions>
"@
# Inject environment variables via task principal environment
[xml]$taskXml = Export-ScheduledTask -TaskName $PusherTask
$ns = "http://schemas.microsoft.com/windows/2004/02/mit/task"
$envNode = $taskXml.CreateElement("EnvironmentVariables", $ns)
foreach ($pair in @("PUSH_URL=$CentralUrl/api/push", "PUSH_SECRET=$($env:PUSH_SECRET)")) {
  $parts = $pair -split "=", 2
  $varNode = $taskXml.CreateElement("Variable", $ns)
  $varNode.SetAttribute("Name", $parts[0])
  $varNode.InnerText = $parts[1]
  $envNode.AppendChild($varNode) | Out-Null
}
$taskXml.Task.AppendChild($envNode) | Out-Null
[System.Environment]::SetEnvironmentVariable("PUSH_URL",    "$CentralUrl/api/push", "Machine")
[System.Environment]::SetEnvironmentVariable("PUSH_SECRET", $env:PUSH_SECRET,       "Machine")
Write-Host "✅ Pusher task registered (starts at login, restarts on crash)"

# Start both now
Start-ScheduledTask -TaskName $BeaconTask
Start-ScheduledTask -TaskName $PusherTask

Write-Host ""
Write-Host "🎉 Done! Both tasks are running."
Write-Host "  Logs: Task Scheduler > Task Scheduler Library"
Write-Host ""
Write-Host "Uninstall: .\$($MyInvocation.MyCommand.Name) -Uninstall"
