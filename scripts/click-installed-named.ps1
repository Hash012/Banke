param([Parameter(Mandatory=$true)][string]$Name)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type @"
using System;using System.Runtime.InteropServices;
public class CommunityPointer {
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
}
"@
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -Encoding UTF8 (Join-Path $root '.local/active-run.json')|ConvertFrom-Json
$app=Get-Process -Id $active.pid
if(!$app.Path.StartsWith((Join-Path $root '.local/installed-community/'),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected test application'}
$native=Get-Content -Raw -Encoding UTF8 (Join-Path $root '.local/evidence/native-window-probe.json')|ConvertFrom-Json
$target=$null;$owner=0
foreach($window in @($native.windows|Where-Object {$_.pid -eq $active.pid -and $_.class -eq 'Chrome_WidgetWin_1' -and $_.visible -and !$_.minimized})){
 $element=[Windows.Automation.AutomationElement]::FromHandle([IntPtr][long]$window.handle)
 $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,$Name)
 foreach($control in $element.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)){if(!$control.Current.IsOffscreen -and $control.Current.IsEnabled){$target=$control;$owner=$window.handle;break}}
 if($target){break}
}
if(!$target){throw 'Visible named control not found'}
$prior=[CommunityPointer]::SetThreadDpiAwarenessContext([IntPtr](-4))
try{
 $r=$target.Current.BoundingRectangle;$point=New-Object CommunityPointer+Point;$point.X=[int]($r.X+$r.Width/2);$point.Y=[int]($r.Y+$r.Height/2)
 $hit=[CommunityPointer]::WindowFromPoint($point);$safe=$false
 for($level=0;$level -lt 20 -and $hit -ne [IntPtr]::Zero;$level++){if($hit.ToInt64() -eq $owner){$safe=$true;break};$hit=[CommunityPointer]::GetParent($hit)}
 if(!$safe){throw 'Control is occluded; no mouse input sent'}
 [void][CommunityPointer]::SetCursorPos($point.X,$point.Y);[CommunityPointer]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[CommunityPointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 [pscustomobject]@{name=$Name;ok=$true;method='Actual scoped Windows pointer input'}|ConvertTo-Json
}finally{if($prior -ne [IntPtr]::Zero){[void][CommunityPointer]::SetThreadDpiAwarenessContext($prior)}}