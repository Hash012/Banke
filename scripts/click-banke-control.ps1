param([Parameter(Mandatory=$true)][ValidateSet('desktopModeButton','syncButton','syncEnable','syncPair','syncDone','exportMenuSummary','importJson','confirmImport','importCancel')][string]$Control)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json') | ConvertFrom-Json
$process=Get-Process -Id $active.pid
if($process.ProcessName -ne 'electron' -or !$process.Path.StartsWith((Join-Path $root 'node_modules\electron\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Target is not isolated Banke'}
$snapshotFile=Get-ChildItem -LiteralPath $active.run -Filter '*.json' | Where-Object {$_.Name -notlike 'result-*'} | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if(((Get-Date)-$snapshotFile.LastWriteTime).TotalSeconds -gt 30){throw 'Snapshot is stale'}
$snapshot=Get-Content -Encoding UTF8 -Raw -LiteralPath $snapshotFile.FullName | ConvertFrom-Json
$role=if($snapshot.status.mode -eq 'desktop'){'desktop-widget'}else{'editor'}
$view=@($snapshot.windows | Where-Object {$_.role -eq $role})[0]
$rect=$view.dom.controls.$Control
if(!$rect -or $rect.visible -eq $false -or $rect.disabled -or $rect.width -le 0 -or $rect.height -le 0){throw 'Requested control is not visible/enabled'}
$native=Get-Content -Raw -LiteralPath (Join-Path $root '.local/evidence/native-window-probe.json') | ConvertFrom-Json
$child=@($native.windows | Where-Object {$_.parent -eq [long]$view.hwnd -and $_.class -eq 'Chrome_RenderWidgetHostHWND'})[0]
$nativeWindow=@($native.windows | Where-Object {$_.handle -eq [long]$view.hwnd})[0]
if(!$child -or $child.width -le 0 -or !$nativeWindow.visible -or $nativeWindow.minimized){throw 'Application window is not visible'}
$clickX=[int]($child.x+($rect.x+$rect.width/2)*$child.width/$view.dom.innerWidth)
$clickY=[int]($child.y+($rect.y+$rect.height/2)*$child.height/$view.dom.innerHeight)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BankePointer {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
$previous=[BankePointer]::SetThreadDpiAwarenessContext([IntPtr](-4))
try{
 $point=New-Object BankePointer+Point
 $point.X=$clickX;$point.Y=$clickY
 $hit=[BankePointer]::WindowFromPoint($point)
 $valid=$false
 for($i=0;$i -lt 20 -and $hit -ne [IntPtr]::Zero;$i++){
  if($hit.ToInt64() -eq [long]$view.hwnd){$valid=$true;break}
  $hit=[BankePointer]::GetParent($hit)
 }
 if(!$valid){throw 'Control is occluded by another app; no mouse input sent'}
 if(![BankePointer]::SetCursorPos($clickX,$clickY)){throw 'Pointer move failed'}
 [BankePointer]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [BankePointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 [pscustomobject]@{at=(Get-Date).ToString('o');control=$Control;role=$role;hwnd=$view.hwnd;x=$clickX;y=$clickY;method='Actual Windows pointer input';ok=$true}|ConvertTo-Json
}finally{if($previous -ne [IntPtr]::Zero){[void][BankePointer]::SetThreadDpiAwarenessContext($previous)}}
