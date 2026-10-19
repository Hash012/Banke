param([switch]$Dialog)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BankeFocus {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr order,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json') | ConvertFrom-Json
$process=Get-Process -Id $active.pid
if(!$process.Path.StartsWith((Join-Path $root 'node_modules\electron\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Not an isolated app'}
$latest=Get-ChildItem -LiteralPath $active.run -Filter '*.json' | Where-Object {$_.Name -notlike 'result-*' -and $_.Name -match '^(startup|snapshot|editor)-?'} | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$view=Get-Content -Encoding UTF8 -Raw -LiteralPath $latest.FullName | ConvertFrom-Json
$editor=@($view.windows | Where-Object {$_.role -eq 'editor'})[0]
$handle=[IntPtr][long]$editor.hwnd
if($Dialog){
 $native=Get-Content -Raw -LiteralPath (Join-Path $root '.local/evidence/native-window-probe.json') | ConvertFrom-Json
 $dialogs=@($native.windows | Where-Object {$_.pid -eq $active.pid -and $_.class -eq '#32770' -and $_.visible})
 if($dialogs.Count -ne 1){throw 'Expected one isolated Banke dialog'}
 $handle=[IntPtr][long]$dialogs[0].handle
}
[void][BankeFocus]::SetWindowPos($handle,[IntPtr]::Zero,0,0,0,0,0x43)
[void][BankeFocus]::SetForegroundWindow($handle)
[uint32]$ownerId=0
[void][BankeFocus]::GetWindowThreadProcessId([BankeFocus]::GetForegroundWindow(),[ref]$ownerId)
if($ownerId -ne $active.pid){
 $previous=[BankeFocus]::SetThreadDpiAwarenessContext([IntPtr](-4))
 try{
  $rect=New-Object BankeFocus+Rect
  if(![BankeFocus]::GetWindowRect($handle,[ref]$rect)){throw 'Editor handle is stale'}
  $point=New-Object BankeFocus+Point
  $point.X=$rect.Left+100;$point.Y=$rect.Top+25
  $hit=[BankeFocus]::WindowFromPoint($point);$valid=$false
  for($i=0;$i -lt 20 -and $hit -ne [IntPtr]::Zero;$i++){if($hit -eq $handle){$valid=$true;break};$hit=[BankeFocus]::GetParent($hit)}
  if(!$valid){throw 'Editor title area is occluded; no input sent'}
  [void][BankeFocus]::SetCursorPos($point.X,$point.Y)
  [BankeFocus]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[BankeFocus]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 }finally{if($previous -ne [IntPtr]::Zero){[void][BankeFocus]::SetThreadDpiAwarenessContext($previous)}}
}
Start-Sleep -Milliseconds 150
[void][BankeFocus]::GetWindowThreadProcessId([BankeFocus]::GetForegroundWindow(),[ref]$ownerId)
if($ownerId -ne $active.pid){throw 'Editor did not receive foreground focus'}
'ISOLATED_BANKE_EDITOR_FOCUSED'
