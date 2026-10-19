$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json')|ConvertFrom-Json
if($active.profile -ne 'installed-fresh'){throw 'Import markers may only be used in the fresh installed profile'}
function Invoke-Control([string]$Action){& (Join-Path $PSScriptRoot 'invoke-banke-installed-control.ps1') -Action $Action|Out-Null}
function Probe{& (Join-Path $PSScriptRoot 'inspect-banke-desktop.ps1') -Summary|Out-Null;Get-Content -Encoding UTF8 -Raw -LiteralPath (Join-Path $root '.local/evidence/native-window-probe.json')|ConvertFrom-Json}
function Open-Backup{
 Invoke-Control 'ExportMenu';Invoke-Control 'Import';$null=Probe
 & (Join-Path $PSScriptRoot 'select-banke-test-file.ps1') -Filename valid.json|Out-Null
 Start-Sleep -Milliseconds 500
}
$schedule=Join-Path $active.expected 'schedule.json'
$before=(Get-FileHash -LiteralPath $schedule).Hash
$report=[ordered]@{method='Windows UI Automation and actual native file picker on unmodified installed ASAR';cancelUnchanged=$false;importCommitted=$false;automaticBackup=$false;cycles=@();winD=$false;normalQuit=$false}
$probe=Probe
if(@($probe.windows|Where-Object {$_.class -eq '#32770' -and $_.visible}).Count -eq 1){
 & (Join-Path $PSScriptRoot 'select-banke-test-file.ps1') -Filename valid.json|Out-Null
 Start-Sleep -Milliseconds 500
}else{Open-Backup}
Invoke-Control 'Cancel'
$report.cancelUnchanged=((Get-FileHash -LiteralPath $schedule).Hash -eq $before)
Open-Backup
Invoke-Control 'ConfirmImport'
$state=Get-Content -Encoding UTF8 -Raw -LiteralPath $schedule|ConvertFrom-Json
$report.importCommitted=($state.events[0].title -eq 'Isolated native import test')
$saved=@(Get-ChildItem -LiteralPath (Join-Path $active.expected 'backups') -Filter 'before-import-*.json')
$report.automaticBackup=(@($saved|Where-Object {(Get-FileHash -LiteralPath $_.FullName).Hash -eq $before}).Count -gt 0)
if(!$report.cancelUnchanged -or !$report.importCommitted -or !$report.automaticBackup){throw 'Installed backup import verification failed'}
for($round=1;$round -le 10;$round++){
 Invoke-Control 'Pin'
 & (Join-Path $PSScriptRoot 'ensure-desktop.ps1')|Out-Null
 $pin=Probe
 $widgets=@($pin.windows|Where-Object {$_.class -eq 'Chrome_WidgetWin_1' -and $_.visible -and !$_.minimized -and $_.parent -ne 0 -and $_.width -gt 600})
 if($widgets.Count -ne 1 -or @($pin.windows|Where-Object {$_.class -eq '#32770' -and $_.visible}).Count){throw 'Desktop attach failed or an error dialog appeared'}
 $image=@($pin.captures|Where-Object {$_.handle -eq $widgets[0].handle})[0].file
 if($round -eq 10){
  for($d=1;$d -le 2;$d++){
   & (Join-Path $PSScriptRoot 'show-desktop.ps1')|Out-Null
   $desktop=Probe
   if(!@($desktop.windows|Where-Object {$_.handle -eq $widgets[0].handle -and $_.visible -and !$_.minimized -and $_.parent -eq $widgets[0].parent}).Count){throw 'Win+D lost the widget'}
  }
  $report.winD=$true
 }
 Invoke-Control 'Return'
 & (Join-Path $PSScriptRoot 'ensure-desktop.ps1')|Out-Null
 & (Join-Path $PSScriptRoot 'restore-banke-editor.ps1')|Out-Null
 $normal=Probe
 $editors=@($normal.windows|Where-Object {$_.class -eq 'Chrome_WidgetWin_1' -and $_.visible -and !$_.minimized -and $_.parent -eq 0 -and $_.width -gt 600})
 if($editors.Count -ne 1){throw 'Normal window restoration failed'}
 $report.cycles+=@{round=$round;pin=$true;return=$true;widgetImage=$image;editorImage=@($normal.captures|Where-Object {$_.handle -eq $editors[0].handle})[0].file}
 $report|ConvertTo-Json -Depth 6|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $active.run 'installed-ui-results.json')
 [pscustomobject]@{round=$round;pin='PASS';return='PASS'}|ConvertTo-Json -Compress
}
Invoke-Control 'Quit';$report.normalQuit=$true
$report|ConvertTo-Json -Depth 6|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $active.run 'installed-ui-results.json')
[pscustomobject]$report|Select-Object method,cancelUnchanged,importCommitted,automaticBackup,winD,normalQuit|ConvertTo-Json
