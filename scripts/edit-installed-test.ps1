$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$taskRoot=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -Encoding UTF8 (Join-Path $taskRoot '.local/active-run.json')|ConvertFrom-Json
if($active.profile -ne 'installed-phone'){throw 'Only the synthetic phone profile may be edited'}
$schedulePath=Join-Path $active.expected 'schedule.json'
$before=Get-Content -Raw -Encoding UTF8 $schedulePath|ConvertFrom-Json
$testEvents=@($before.events|Where-Object title -eq '新通用版离线验收')
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
Invoke-Button '新通用版离线验收'
$edit=@(Elements|Where-Object {$_.Current.ControlType -eq [Windows.Automation.ControlType]::Edit -and $_.Current.Name -eq '安排名称' -and !$_.Current.IsOffscreen})
if($edit.Count -ne 1){throw 'Expected title edit control'}
$value=$edit[0].GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
if($value.Current.Value -ne '新通用版离线验收'){throw 'Unexpected event selected'}
$value.SetValue('新通用版电脑验收')
Invoke-Button '保存安排'
Start-Sleep -Milliseconds 800
$after=Get-Content -Raw -Encoding UTF8 $schedulePath|ConvertFrom-Json
if($after.events.Count -ne 1 -or $after.events[0].title -ne '新通用版电脑验收' -or $after.events[0].id -ne $testEvents[0].id -or $after.events[0].start -ne $testEvents[0].start -or $after.events[0].day -ne $testEvents[0].day){throw 'Actual UI edit did not preserve other event fields'}
[pscustomobject]@{ok=$true;method='Windows UI Automation in unmodified installed app';renamed=$true;otherFieldsPreserved=$true}|ConvertTo-Json