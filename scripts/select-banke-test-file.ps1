param([Parameter(Mandatory=$true)][ValidateSet('valid.json','invalid.json')][string]$Filename)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json') | ConvertFrom-Json
$native=Get-Content -Raw -LiteralPath (Join-Path $root '.local/evidence/native-window-probe.json') | ConvertFrom-Json
$dialogs=@($native.windows | Where-Object {$_.pid -eq $active.pid -and $_.class -eq '#32770' -and $_.visible})
if($dialogs.Count -ne 1){throw 'Expected exactly one isolated Banke file picker'}
$dialog=[Windows.Automation.AutomationElement]::FromHandle([IntPtr]$dialogs[0].handle)
$elements=$dialog.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
$filenameEdit=$null
foreach($element in $elements){
 if($element.Current.ControlType -eq [Windows.Automation.ControlType]::Edit -and $element.Current.AutomationId -in @('1001','1148')){
  $value=$null
  if($element.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$value) -and !$value.Current.IsReadOnly){$filenameEdit=$value;break}
 }
}
if(!$filenameEdit){
 Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BankeNativeFilePicker {
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageW(IntPtr hwnd,uint msg,IntPtr wparam,string text);
 [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr hwnd,uint msg,IntPtr wparam,IntPtr lparam);
}
'@
 $nativeEdits=@($native.windows | Where-Object {$_.pid -eq $active.pid -and $_.class -eq 'Edit' -and $_.visible})
 foreach($nativeEdit in $nativeEdits){
  $editId=[BankeNativeFilePicker]::GetDlgCtrlID([IntPtr]$nativeEdit.handle)
  if($editId -in @(1001,1148)){
   [uint32]$editOwner=0
   [void][BankeNativeFilePicker]::GetWindowThreadProcessId([IntPtr]$nativeEdit.handle,[ref]$editOwner)
   if($editOwner -ne $active.pid){throw 'Native file name control owner changed'}
   [void][BankeNativeFilePicker]::SendMessageW([IntPtr]$nativeEdit.handle,0x0c,[IntPtr]::Zero,(Join-Path $root ('.local/test-inputs/'+$Filename)))
   if(![BankeNativeFilePicker]::PostMessageW([IntPtr]$dialogs[0].handle,0x111,[IntPtr]1,[IntPtr]::Zero)){throw 'Native Open command failed'}
   Start-Sleep -Milliseconds 700
   [pscustomobject]@{file=$Filename;method='Actual native file picker using scoped Win32 control messages';ok=$true}|ConvertTo-Json
   return
  }
 }
 Add-Type -AssemblyName System.Windows.Forms
 Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BankeFileKeys {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
 $handle=[IntPtr]$dialogs[0].handle
 foreach($keys in @('%n','^a',(Join-Path $root ('.local/test-inputs/'+$Filename)),'{ENTER}')){
  if([BankeFileKeys]::GetForegroundWindow() -ne $handle){throw 'File picker lost foreground; no further input sent'}
  [Windows.Forms.SendKeys]::SendWait($keys)
 }
 Start-Sleep -Milliseconds 700
 [pscustomobject]@{file=$Filename;method='Actual native file picker with Windows keyboard input';ok=$true}|ConvertTo-Json
 return
}
$filenameEdit.SetValue((Join-Path $root ('.local/test-inputs/'+$Filename)))
$openButton=@($elements | Where-Object {$_.Current.ControlType -eq [Windows.Automation.ControlType]::Button -and $_.Current.AutomationId -eq '1'})
if($openButton.Count -ne 1){throw 'File picker Open button not found'}
$openButton[0].GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
Start-Sleep -Milliseconds 600
[pscustomobject]@{file=$Filename;method='Actual native file picker via Windows UI Automation';ok=$true}|ConvertTo-Json
