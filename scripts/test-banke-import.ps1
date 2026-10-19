$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json') | ConvertFrom-Json
if($active.profile -notin @('community-import')){throw 'Only a dedicated import test profile is allowed'}
$schedule=Join-Path $active.expected 'schedule.json'
$report=[ordered]@{method='Actual native file picker using scoped Win32 messages; HTML buttons activated in real Electron DOM, not physical input; all data isolated';preview=$false;cancelUnchanged=$false;importCommitted=$false;automaticBackup=$false;invalidJSONUnchanged=$false;stalePreviewStopped=$false}
function Refresh-View {
 $result=& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action snapshot | ConvertFrom-Json
 if(!$result.ok){throw 'Snapshot failed'}
 & (Join-Path $PSScriptRoot 'inspect-banke-desktop.ps1') -Summary | Out-Null
 return @($result.result.windows | Where-Object {$_.role -eq 'editor'})[0].dom
}
function Open-TestBackup([string]$Filename){
 & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-import | Out-Null
 & (Join-Path $PSScriptRoot 'inspect-banke-desktop.ps1') -Summary | Out-Null
 & (Join-Path $PSScriptRoot 'select-banke-test-file.ps1') -Filename $Filename | Out-Null
 return Refresh-View
}
function Click-Control([string]$Control){
 $action=if($Control -eq 'importCancel'){'ui-cancel-import'}elseif($Control -eq 'confirmImport'){'ui-confirm-import'}else{throw 'Unsupported import control'}
 & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action $action | Out-Null
 Start-Sleep -Milliseconds 500
}
$beforeHash=(Get-FileHash -LiteralPath $schedule).Hash
$beforeText=Get-Content -Encoding UTF8 -Raw -LiteralPath $schedule
$dom=Refresh-View
if('importDialog' -notin $dom.openDialogs){$dom=Open-TestBackup 'valid.json'}
if('importDialog' -notin $dom.openDialogs){throw 'Real import preview did not open'}
$report.preview=$true
Click-Control 'importCancel'
$dom=Refresh-View
$report.cancelUnchanged=((Get-FileHash -LiteralPath $schedule).Hash -eq $beforeHash -and 'importDialog' -notin $dom.openDialogs)
$dom=Open-TestBackup 'valid.json'
if('importDialog' -notin $dom.openDialogs){throw 'Valid backup preview did not open'}
Click-Control 'confirmImport'
$dom=Refresh-View
$after=Get-Content -Encoding UTF8 -Raw -LiteralPath $schedule | ConvertFrom-Json
$report.importCommitted=($after.events[0].title -eq 'Isolated native import test' -and 'importDialog' -notin $dom.openDialogs)
$backups=@(Get-ChildItem -LiteralPath (Join-Path $active.expected 'backups') -Filter 'before-import-*.json')
if($backups.Count){
 $previous=Get-Content -Encoding UTF8 -Raw -LiteralPath $backups[-1].FullName | ConvertFrom-Json
 $report.automaticBackup=(($previous|ConvertTo-Json -Depth 30 -Compress) -eq (($beforeText|ConvertFrom-Json)|ConvertTo-Json -Depth 30 -Compress))
}
$beforeInvalid=(Get-FileHash -LiteralPath $schedule).Hash
$dom=Open-TestBackup 'invalid.json'
$report.invalidJSONUnchanged=((Get-FileHash -LiteralPath $schedule).Hash -eq $beforeInvalid -and 'importDialog' -notin $dom.openDialogs)
$dom=Open-TestBackup 'valid.json'
if('importDialog' -notin $dom.openDialogs){throw 'Stale preview setup failed'}
& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action concurrent-save | Out-Null
$concurrentHash=(Get-FileHash -LiteralPath $schedule).Hash
$dom=Refresh-View
Click-Control 'confirmImport'
$dom=Refresh-View
$report.stalePreviewStopped=((Get-FileHash -LiteralPath $schedule).Hash -eq $concurrentHash -and 'importDialog' -in $dom.openDialogs -and ![string]::IsNullOrWhiteSpace($dom.toast))
$report.staleCheckMethod='Actual sync service revision changed in diagnostic process; not a real phone edit'
Click-Control 'importCancel'
$report | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $active.run 'native-import-results.json')
$report | ConvertTo-Json -Depth 4
if(@($report.Values|Where-Object {$_ -is [bool] -and !$_}).Count){throw 'One or more import checks failed'}
