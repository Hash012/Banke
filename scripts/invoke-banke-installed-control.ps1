param([Parameter(Mandatory=$true)][ValidateSet('Pin','Return','ExportMenu','Import','ConfirmImport','Cancel','SyncOpen','SyncEnable','Pair','Approve','SyncDone','Quit')][string]$Action)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json')|ConvertFrom-Json
if($active.profile -notin @('installed-fresh','installed-upgrade','installed-phone')){throw 'Only installed test profiles are allowed'}
$process=Get-Process -Id $active.pid
if(!$process.Path.StartsWith((Join-Path $root '.local/installed-community'),[StringComparison]::OrdinalIgnoreCase)){throw 'Wrong executable'}
& (Join-Path $PSScriptRoot 'inspect-banke-desktop.ps1') -Summary | Out-Null
$native=Get-Content -Encoding UTF8 -Raw -LiteralPath (Join-Path $root '.local/evidence/native-window-probe.json')|ConvertFrom-Json
$windows=@(foreach($window in $native.windows){if($window.pid -eq $active.pid -and $window.class -eq 'Chrome_WidgetWin_1' -and $window.visible -and !$window.minimized){[Windows.Automation.AutomationElement]::FromHandle([IntPtr][long]$window.handle)}})
if($Action -eq 'Quit'){
 foreach($window in $windows){$p=$null;if(!$window.Current.IsOffscreen -and $window.TryGetCurrentPattern([Windows.Automation.WindowPattern]::Pattern,[ref]$p)){$p.Close();Start-Sleep -Seconds 1;break}}
 if(Get-Process -Id $active.pid -ErrorAction SilentlyContinue){throw 'Installed app did not exit normally'}
}else{
 $names=@{Pin='固定到桌面';Return='返回普通窗口';ExportMenu='备份与导出';Import='导入备份';ConfirmImport='自动备份并导入';Cancel='取消';SyncOpen='手机自动同步';SyncEnable='开启局域网同步';Pair='允许新手机配对 · 2 分钟';Approve='数字一致 · 允许连接';SyncDone='完成'}
 $name=$names[$Action];$invoked=$false
 foreach($window in $windows){
  $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,$name)
  foreach($element in $window.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)){
   if($element.Current.IsOffscreen -or !$element.Current.IsEnabled){continue}
   $candidate=$element
   for($level=0;$level -lt 3 -and $candidate;$level++){
    $pattern=$null
    if($candidate.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$pattern.Invoke();$invoked=$true;break}
    if($Action -eq 'ExportMenu' -and $candidate.TryGetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern,[ref]$pattern)){$pattern.Expand();$invoked=$true;break}
    if($Action -ne 'ExportMenu'){break}
    $candidate=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($candidate)
   }
   if($invoked){break}
  }
  if($invoked){break}
 }
 if(!$invoked){throw ('Visible installed-app control not found: '+$Action)}
 Start-Sleep -Milliseconds 650
}
[pscustomobject]@{action=$Action;ok=$true;method='Windows UI Automation on unmodified installed application'}|ConvertTo-Json -Compress
