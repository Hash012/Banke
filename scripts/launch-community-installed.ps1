param([ValidateSet('fresh','upgrade','phone')][string]$Mode='fresh')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$exe=Join-Path $root '.local\installed-community\BankeCommunity.exe'
$asar=Join-Path (Split-Path -Parent $exe) 'resources\app.asar'
if((Get-FileHash -LiteralPath $asar).Hash -ne (Get-FileHash -LiteralPath (Join-Path $root 'dist\win-unpacked\resources\app.asar')).Hash){throw 'Installed candidate differs from current build'}
$data=Join-Path $root ('.local\installed-data-community-'+$Mode)
[void][IO.Directory]::CreateDirectory($data)
$run=Join-Path $root ('.local\evidence\run-installed-'+$Mode+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
[void][IO.Directory]::CreateDirectory($run)
$app=Start-Process -FilePath $exe -ArgumentList @(('--banke-test-data-dir='+$data),'--force-renderer-accessibility') -WindowStyle Normal -PassThru
Start-Sleep -Seconds 3
if($app.HasExited){throw 'Installed community app exited at startup'}
$active=@{pid=$app.Id;expected=$data;profile=('installed-'+$Mode);run=$run}
[IO.File]::WriteAllText((Join-Path $root '.local\active-run.json'),($active | ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
$active | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $run 'launch.json')
$active | ConvertTo-Json
