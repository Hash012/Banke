$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -Encoding UTF8 (Join-Path $root '.local/active-run.json')|ConvertFrom-Json
if($active.profile -ne 'installed-phone'){throw 'Only installed phone test data is allowed'}
$schedule=Join-Path $active.expected 'schedule.json'
$before=(Get-FileHash -LiteralPath $schedule).Hash
& (Join-Path $PSScriptRoot 'invoke-banke-installed-control.ps1') -Action Return | Out-Null
$results=New-Object System.Collections.Generic.List[object]
for($round=1;$round -le 3;$round++){
 & (Join-Path $PSScriptRoot 'invoke-banke-installed-control.ps1') -Action Quit | Out-Null
 $launch=& (Join-Path $PSScriptRoot 'launch-community-installed.ps1') -Mode phone | ConvertFrom-Json
 & (Join-Path $PSScriptRoot 'ensure-desktop.ps1') | Out-Null
 & (Join-Path $PSScriptRoot 'restore-banke-editor.ps1') | Out-Null
 & (Join-Path $PSScriptRoot 'inspect-banke-desktop.ps1') -Summary | Out-Null
 $native=Get-Content -Raw -Encoding UTF8 (Join-Path $root '.local/evidence/native-window-probe.json')|ConvertFrom-Json
 $editor=@($native.windows | Where-Object {$_.pid -eq $launch.pid -and $_.class -eq 'Chrome_WidgetWin_1' -and $_.visible -and !$_.minimized -and $_.parent -eq 0 -and $_.width -gt 600})
 if($editor.Count -ne 1){throw 'Visible ordinary editor missing'}
 $capture=@($native.captures|Where-Object {$_.handle -eq $editor[0].handle -and $_.ok})
 if($capture.Count -ne 1){throw 'No actual unobscured window capture'}
 if((Get-FileHash -LiteralPath $schedule).Hash -ne $before){throw 'Cold start changed the synthetic schedule'}
 $sync=Get-Content -Raw -Encoding UTF8 (Join-Path $launch.expected 'sync-state.json')|ConvertFrom-Json
 if($sync.devices.Count -ne 1){throw 'Cold start lost pairing'}
 $results.Add([pscustomobject]@{round=$round;ordinaryVisible=$true;unobscuredImage=$capture[0].file;schedulePreserved=$true;pairedDevices=1})
 [pscustomobject]@{round=$round;ordinary='PASS';schedulePreserved=$true;pairedDevices=1}|ConvertTo-Json -Compress
}
$results.ToArray()|ConvertTo-Json -Depth 4|Set-Content -Encoding UTF8 (Join-Path $root '.local/evidence/community-cold-start.json')