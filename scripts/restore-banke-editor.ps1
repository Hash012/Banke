$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$taskRoot=Split-Path -Parent $PSScriptRoot
$bankeIds=@([int](Get-Content -Raw -Encoding UTF8 (Join-Path $taskRoot '.local/active-run.json') | ConvertFrom-Json).pid)
$root=[Windows.Automation.AutomationElement]::RootElement
$count=0
foreach($bankeId in $bankeIds){
    $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty,$bankeId)
    $items=$root.FindAll([Windows.Automation.TreeScope]::Children,$condition)
    foreach($item in $items){
        $pattern=$null
        if($item.TryGetCurrentPattern([Windows.Automation.WindowPattern]::Pattern,[ref]$pattern)){
            if($pattern.Current.WindowVisualState -eq [Windows.Automation.WindowVisualState]::Minimized){
                $pattern.SetWindowVisualState([Windows.Automation.WindowVisualState]::Normal)
                $count++
                [pscustomobject]@{restoredHandle=$item.Current.NativeWindowHandle;processId=$bankeId}
            }
        }
    }
}
[pscustomobject]@{restoredCount=$count;note='UI Automation WindowPattern restore, not Computer Use.'}
