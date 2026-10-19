param(
    [Parameter(Mandatory=$true)][long]$WindowHandle,
    [Parameter(Mandatory=$true)][ValidateSet('完成','固定到桌面','返回普通窗口','Quit')][string]$Action
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$window=[Windows.Automation.AutomationElement]::FromHandle([IntPtr]$WindowHandle)
$process=Get-Process -Id $window.Current.ProcessId
if($process.ProcessName -ne 'electron'){throw 'Target is not Banke.'}
if($Action -eq 'Quit'){
    $pattern=$window.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern)
    $pattern.Close()
}else{
    $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,$Action)
    $matches=$window.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)
    $invoked=$false
    foreach($match in $matches){
        $pattern=$null
        if($match.Current.IsEnabled -and !$match.Current.IsOffscreen -and $match.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){
            $pattern.Invoke();$invoked=$true;break
        }
    }
    if(!$invoked){throw ('Visible invokable Banke control not found: ' + $Action)}
}
[pscustomobject]@{at=(Get-Date).ToString('o');handle=$WindowHandle;action=$Action;method='Windows UI Automation';ok=$true} | ConvertTo-Json
