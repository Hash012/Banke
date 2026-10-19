$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$taskRoot=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -Encoding UTF8 (Join-Path $taskRoot '.local/active-run.json')|ConvertFrom-Json
if($active.profile -ne 'installed-phone'){throw 'Only the synthetic phone profile may be edited'}
$schedulePath=Join-Path $active.expected 'schedule.json'
$before=Get-Content -Raw -Encoding UTF8 $schedulePath|ConvertFrom-Json
$testEvents=@($before.events|Where-Object title -eq '新通用版电脑验收')
if($testEvents.Count -ne 1 -or $before.events.Count -ne 1){throw 'Expected exactly the one synthetic phone event'}
function Elements {
 $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty,([int]$active.pid))
 $windows=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$condition)
 foreach($window in $windows){$window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)}
}
function Invoke-Button([string]$fragment,[bool]$Optional=$false){
 $buttons=@(Elements|Where-Object {$_.Current.ControlType -eq [Windows.Automation.ControlType]::Button -and !$_.Current.IsOffscreen -and $_.Current.IsEnabled -and $_.Current.Name.Contains($fragment)})
 if(!$buttons.Count -and $Optional){return}
 if($buttons.Count -ne 1){throw ('Expected one visible button: '+$fragment)}
 $buttons[0].GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
 Start-Sleep -Milliseconds 600
}
Invoke-Button '完成' $true
Invoke-Button '课程与安排'
Invoke-Button '新通用版电脑验收'
Invoke-Button '删除'
Start-Sleep -Milliseconds 1000
$after=Get-Content -Raw -Encoding UTF8 $schedulePath|ConvertFrom-Json
$sync=Get-Content -Raw -Encoding UTF8 (Join-Path $active.expected 'sync-state.json')|ConvertFrom-Json
if(@($after.events).Count -ne 0 -or @($sync.devices).Count -ne 1){throw 'Expected empty synthetic schedule and retained pairing'}
$result=[pscustomobject]@{ok=$true;method='Windows UI Automation in unmodified installed app';temporaryEventDeleted=$true;pairedDevices=1}
$result|ConvertTo-Json|Set-Content -Encoding UTF8 (Join-Path $taskRoot '.local/evidence/community-cleanup.json')
$result|ConvertTo-Json