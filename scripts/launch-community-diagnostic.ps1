param([ValidatePattern('^[a-z0-9-]+$')][string]$Profile='community-import')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$electron=Join-Path $root 'node_modules\electron\dist\electron.exe'
$entry=Join-Path $root 'desktop\diagnostic-main.cjs'
$data=Join-Path $root ('.local\test-profiles\'+$Profile+'\appdata\BankeCommunity')
$env:BANKE_DIAGNOSTIC_PROFILE=$Profile
$env:BANKE_DIAGNOSTIC_VARIANT='baseline'
$process=Start-Process -FilePath $electron -ArgumentList @($entry,('--banke-test-data-dir='+$data),'--force-renderer-accessibility') -WindowStyle Normal -PassThru
for($n=0;$n -lt 60;$n++){
 if($process.HasExited){throw 'Diagnostic app exited before ready'}
 $active=Join-Path $root '.local\active-run.json'
 if(Test-Path -LiteralPath $active){$run=Get-Content -Raw -Encoding UTF8 $active | ConvertFrom-Json;if($run.pid -eq $process.Id -and (Test-Path -LiteralPath (Join-Path $run.run 'startup.json'))){[pscustomobject]@{pid=$process.Id;profile=$Profile;run=$run.run;data=$data} | ConvertTo-Json;exit}}
 Start-Sleep -Milliseconds 250
}
throw 'Diagnostic startup timed out'
