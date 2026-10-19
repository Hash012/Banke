param([Parameter(Mandatory=$true)][ValidateSet('snapshot','pin','editor','quit','sync-status','concurrent-save','ui-import','ui-cancel-import','ui-confirm-import','ui-sync-open','ui-sync-enable','ui-sync-pair','ui-sync-done','ui-test-rename','ui-test-delete')][string]$Action)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$root=Split-Path -Parent $PSScriptRoot
$run=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json') | ConvertFrom-Json
$process=Get-Process -Id $run.pid
if($process.ProcessName -ne 'electron' -or !$process.Path.StartsWith((Join-Path $root 'node_modules\electron\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Not an isolated Banke process'}
$commandId=$Action+'-'+(Get-Date -Format 'yyyyMMdd-HHmmssfff')
$commandFile=Join-Path $root '.local/diagnostic-command.json'
$tempFile=$commandFile+'.new'
[IO.File]::WriteAllText($tempFile,(@{id=$commandId;action=$Action}|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
Move-Item -LiteralPath $tempFile -Destination $commandFile -Force
if($Action -eq 'quit'){Start-Sleep -Seconds 2;return}
$resultFile=Join-Path $run.run ('result-'+$commandId+'.json')
for($attempt=0;$attempt -lt 80;$attempt++){if(Test-Path -LiteralPath $resultFile){Get-Content -Encoding UTF8 -Raw -LiteralPath $resultFile;return};Start-Sleep -Milliseconds 250}
throw 'Diagnostic action did not finish in 20 seconds'
