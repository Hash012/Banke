$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json') | ConvertFrom-Json
if($active.profile -ne 'community-import'){throw 'Only the dedicated non-phone test profile is allowed'}
& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-open | Out-Null
$initial=& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action sync-status | ConvertFrom-Json
if($initial.result.running){& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-enable | Out-Null}
$holderProcess=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @((Join-Path $PSScriptRoot 'hold-banke-test-ports.cjs')) -WindowStyle Hidden -PassThru
$holder=$null
try{
 for($i=0;$i -lt 40;$i++){
  $holderFile=Join-Path $root '.local/test-port-holder.json'
  if(Test-Path -LiteralPath $holderFile){$candidate=Get-Content -Raw -LiteralPath $holderFile|ConvertFrom-Json;if($candidate.pid -eq $holderProcess.Id){$holder=$candidate;break}}
  Start-Sleep -Milliseconds 100
 }
 if(!$holder){throw 'Controlled port holder did not start'}
 & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-open | Out-Null
 & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-enable | Out-Null
 $first=& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action sync-status | ConvertFrom-Json
 if(!$first.result.running){throw 'Sync listener did not start'}
 $held=@($holder.results|Where-Object {$_.held}|ForEach-Object {$_.port})
 if($first.result.port -in $held){throw 'App claimed an occupied port'}
 $switches=New-Object System.Collections.Generic.List[object]
 for($i=1;$i -le 3;$i++){
  & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-enable | Out-Null
  $off=& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action sync-status | ConvertFrom-Json
  if($off.result.running){throw 'Sync did not stop'}
  & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-enable | Out-Null
  $on=& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action sync-status | ConvertFrom-Json
  if(!$on.result.running){throw 'Sync restart failed'}
  $switches.Add([pscustomobject]@{round=$i;stopped=$true;running=$true;port=$on.result.port})
 }
 $result=[pscustomobject]@{method='Real Electron sync UI activation, actual Windows TCP listeners';controlledPorts=$holder.results;actualPort=$first.result.port;fallback=($first.result.port -notin $held);switches=$switches.ToArray();phoneTest=$false}
 $result|ConvertTo-Json -Depth 5|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $active.run 'sync-ui-results.json')
 $result|ConvertTo-Json -Depth 5
 & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-enable | Out-Null
 & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action ui-sync-done | Out-Null
}finally{if($holder){[IO.File]::WriteAllText($holder.release,'release')};$holderProcess.WaitForExit(3000)|Out-Null}
