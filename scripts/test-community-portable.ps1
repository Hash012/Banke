$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$activePath=Join-Path $taskRoot '.local/active-run.json'
$previous=[IO.File]::ReadAllText($activePath)
$target=Join-Path $taskRoot '.local/portable-community-1.3.2'
if(Test-Path -LiteralPath $target){throw 'Refusing to overwrite a previous portable run'}
Expand-Archive -LiteralPath (Join-Path $taskRoot 'dist/Banke-Community-1.3.2-Windows-x64.zip') -DestinationPath $target
$exe=Join-Path $target 'BankeCommunity.exe'
$asar=Join-Path $target 'resources/app.asar'
if((Get-FileHash -LiteralPath $asar).Hash -ne (Get-FileHash -LiteralPath (Join-Path $taskRoot 'dist/win-unpacked/resources/app.asar')).Hash){throw 'Portable archive differs from tested build'}
$data=Join-Path $taskRoot '.local/portable-data-community-1.3.2'
if(Test-Path -LiteralPath $data){throw 'Portable test data must start empty'}
$app=Start-Process -FilePath $exe -ArgumentList @(('--banke-test-data-dir='+$data),'--force-renderer-accessibility') -WindowStyle Normal -PassThru
try{
 Start-Sleep -Seconds 4
 if($app.HasExited){throw 'Portable app exited at startup'}
 $active=@{pid=$app.Id;expected=$data;profile='portable-fresh';run=(Join-Path $taskRoot '.local/evidence')}
 [IO.File]::WriteAllText($activePath,($active|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
 & (Join-Path $PSScriptRoot 'ensure-desktop.ps1')|Out-Null
 & (Join-Path $PSScriptRoot 'restore-banke-editor.ps1')|Out-Null
 & (Join-Path $PSScriptRoot 'inspect-banke-desktop.ps1') -Summary|Out-Null
 $native=Get-Content -Raw -Encoding UTF8 (Join-Path $taskRoot '.local/evidence/native-window-probe.json')|ConvertFrom-Json
 $capture=@($native.captures|Where-Object ok)
 if($capture.Count -ne 1){throw 'Expected unobscured portable window screenshot'}
 $schedule=Get-Content -Raw -Encoding UTF8 (Join-Path $data 'schedule.json')|ConvertFrom-Json
 if(@($schedule.events).Count -ne 0){throw 'Portable did not start blank'}
 $result=[pscustomobject]@{actualZipExtracted=$true;ordinaryVisible=$true;blankSchedule=$true;asarMatchesInstalled=$true;image=$capture[0].file}
 $result|ConvertTo-Json|Set-Content -Encoding UTF8 (Join-Path $taskRoot '.local/evidence/community-portable.json')
 $result|ConvertTo-Json
}finally{
 try{
  Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
  $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty,([int]$app.Id))
  $windows=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$condition)
  foreach($window in $windows){
   $pattern=$null
   if($window.TryGetCurrentPattern([Windows.Automation.WindowPattern]::Pattern,[ref]$pattern)){$pattern.Close();break}
  }
  Start-Sleep -Seconds 1
  if(Get-Process -Id $app.Id -ErrorAction SilentlyContinue){throw 'Portable app did not exit normally'}
 }finally{[IO.File]::WriteAllText($activePath,$previous,(New-Object Text.UTF8Encoding($false)))}
}