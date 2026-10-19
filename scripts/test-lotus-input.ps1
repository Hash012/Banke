param([Parameter(Mandatory=$true)][string]$Evidence)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$resolved=[IO.Path]::GetFullPath($Evidence)
if(!$resolved.StartsWith((Join-Path $root '.local\lotus-native-'),[StringComparison]::OrdinalIgnoreCase)){throw 'Only the isolated lotus suite is allowed'}
$target=Get-Content -Raw -Encoding UTF8 (Join-Path $resolved 'input-target.json') | ConvertFrom-Json
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LotusNativeInput {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flag);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
}
'@
$handle=[IntPtr]([long]$target.handle)
[uint32]$owner=0
[void][LotusNativeInput]::GetWindowThreadProcessId($handle,[ref]$owner)
if($owner -ne [uint32]$target.pid -or ![LotusNativeInput]::IsWindowVisible($handle)){throw 'The recorded isolated window no longer exists'}
$oldDpi=[LotusNativeInput]::SetThreadDpiAwarenessContext([IntPtr](-4))
$oldCursor=New-Object LotusNativeInput+Point
[void][LotusNativeInput]::GetCursorPos([ref]$oldCursor)
$down=$false
try {
 $before=New-Object LotusNativeInput+Rect
 [void][LotusNativeInput]::GetWindowRect($handle,[ref]$before)
 $point=New-Object LotusNativeInput+Point
 $point.X=$before.Left+[int]($target.flower.x*($before.Right-$before.Left)/360)
 $point.Y=$before.Top+[int]($target.flower.y*($before.Bottom-$before.Top)/320)
 [void][LotusNativeInput]::SetCursorPos($point.X,$point.Y)
 Start-Sleep -Milliseconds 500
 $hit=[LotusNativeInput]::WindowFromPoint($point)
 if($hit -ne $handle -and [LotusNativeInput]::GetAncestor($hit,2) -ne $handle){throw ('Pointer is blocked; no click sent. Hit='+$hit+' expected='+$handle+' nativePoint='+$point.X+','+$point.Y+' nativeRect='+($before|ConvertTo-Json -Compress))}
 [LotusNativeInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero);$down=$true
 for($step=1;$step -le 10;$step++) { [void][LotusNativeInput]::SetCursorPos(($point.X+$step*5),($point.Y-$step*3));Start-Sleep -Milliseconds 40 }
 [LotusNativeInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero);$down=$false
 Start-Sleep -Milliseconds 700
 $after=New-Object LotusNativeInput+Rect
 [void][LotusNativeInput]::GetWindowRect($handle,[ref]$after)
 if([Math]::Abs($after.Left-$before.Left) -lt 10 -or [Math]::Abs($after.Top-$before.Top) -lt 10){throw 'Real native drag did not move the lotus'}
 $blank=New-Object LotusNativeInput+Point;$blank.X=$after.Left+3;$blank.Y=$after.Top+3
 [void][LotusNativeInput]::SetCursorPos($blank.X,$blank.Y);Start-Sleep -Milliseconds 500
 $blankHit=[LotusNativeInput]::WindowFromPoint($blank)
 $passThrough=$blankHit -ne $handle -and [LotusNativeInput]::GetAncestor($blankHit,2) -ne $handle
 if(!$passThrough){throw 'Transparent corner intercepted the pointer'}
 $bitmap=New-Object Drawing.Bitmap(($after.Right-$after.Left),($after.Bottom-$after.Top))
 $graphics=[Drawing.Graphics]::FromImage($bitmap);$dc=$graphics.GetHdc()
 try{$printed=[LotusNativeInput]::PrintWindow($handle,$dc,2)}finally{$graphics.ReleaseHdc($dc)}
 if($printed){$bitmap.Save((Join-Path $resolved 'lotus-native-printwindow.png'))};$graphics.Dispose();$bitmap.Dispose()
 $result=@{ok=$true;method='Guarded Win32 SetCursorPos and mouse_event; WindowFromPoint verifies the isolated lotus before button-down';dragDeltaX=($after.Left-$before.Left);dragDeltaY=($after.Top-$before.Top);transparentPassThrough=$passThrough;printWindow=$printed}
 [IO.File]::WriteAllText((Join-Path $resolved 'native-input-result.json'),($result | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 $result | ConvertTo-Json
} catch {
 $result=@{ok=$false;error=$_.Exception.Message}
 [IO.File]::WriteAllText((Join-Path $resolved 'native-input-result.json'),($result | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 throw
} finally {
 if($down){[LotusNativeInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 [void][LotusNativeInput]::SetCursorPos($oldCursor.X,$oldCursor.Y)
 if($oldDpi -ne [IntPtr]::Zero){[void][LotusNativeInput]::SetThreadDpiAwarenessContext($oldDpi)}
}
