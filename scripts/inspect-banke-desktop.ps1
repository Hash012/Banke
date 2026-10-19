param([switch]$Summary)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Drawing
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class BankeWindowProbe {
    public delegate bool EnumProc(IntPtr handle, IntPtr state);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool EnumWindows(EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr handle, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
}
'@
$active=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) '.local/active-run.json') | ConvertFrom-Json
$bankeIds = @([int]$active.pid)
$appName=(Get-Process -Id $active.pid).ProcessName
if($appName -notin @('electron','BankeCommunity')){throw 'Unexpected test process'}
$family=@(Get-CimInstance Win32_Process -Filter ("Name='"+$appName+".exe'") | Select-Object ProcessId,ParentProcessId)
for($level=0;$level -lt 4;$level++){$bankeIds=@($bankeIds+@($family | Where-Object {$bankeIds -contains [int]$_.ParentProcessId} | ForEach-Object {[int]$_.ProcessId}) | Select-Object -Unique)}
$previousDpi = [BankeWindowProbe]::SetThreadDpiAwarenessContext([IntPtr](-4))
$found = New-Object System.Collections.Generic.List[object]
$seen = New-Object 'System.Collections.Generic.HashSet[long]'
$collect = [BankeWindowProbe+EnumProc] {
    param($handle, $state)
    [uint32]$windowProcess = 0
    [void][BankeWindowProbe]::GetWindowThreadProcessId($handle, [ref]$windowProcess)
    if ($bankeIds -contains [int]$windowProcess -and $seen.Add($handle.ToInt64())) {
        $rect = New-Object BankeWindowProbe+Rect
        [void][BankeWindowProbe]::GetWindowRect($handle, [ref]$rect)
        $class = New-Object System.Text.StringBuilder 256
        [void][BankeWindowProbe]::GetClassName($handle, $class, $class.Capacity)
        $found.Add([pscustomobject]@{
            pid=$windowProcess; handle=$handle.ToInt64(); parent=[BankeWindowProbe]::GetParent($handle).ToInt64()
            class=$class.ToString(); visible=[BankeWindowProbe]::IsWindowVisible($handle); minimized=[BankeWindowProbe]::IsIconic($handle)
            x=$rect.Left; y=$rect.Top; width=($rect.Right-$rect.Left); height=($rect.Bottom-$rect.Top)
        })
    }
    return $true
}
$top = [BankeWindowProbe+EnumProc] {
    param($handle, $state)
    [void]$collect.Invoke($handle, $state)
    [void][BankeWindowProbe]::EnumChildWindows($handle, $collect, [IntPtr]::Zero)
    return $true
}
$enumerated = [BankeWindowProbe]::EnumWindows($top, [IntPtr]::Zero)
$enumError = if($enumerated){0}else{[Runtime.InteropServices.Marshal]::GetLastWin32Error()}
$evidence = Join-Path (Split-Path -Parent $PSScriptRoot) '.local\evidence'
[void][IO.Directory]::CreateDirectory($evidence)
$captures = New-Object System.Collections.Generic.List[object]
foreach ($item in $found) {
    if (!$item.visible -or $item.minimized -or $item.width -lt 300 -or $item.height -lt 200 -or $item.class -notin @('Chrome_WidgetWin_1','#32770')) { continue }
    if($item.class -eq '#32770'){continue}
    $verifyVisible=$false
    try {
      $rootElement=[Windows.Automation.AutomationElement]::FromHandle([IntPtr]$item.handle)
      foreach($node in $rootElement.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)){
        if(!$node.Current.IsOffscreen -and $node.Current.Name -match '^\s*[0-9]{4}\s?[0-9]{4}\s*$'){$verifyVisible=$true;break}
      }
    } catch {$verifyVisible=$true}
    if($verifyVisible){$captures.Add([pscustomobject]@{handle=$item.handle;ok=$false;reason='Verification may be visible; screenshot omitted'});continue}
    $clear=$true
    foreach($fraction in @(@(0.25,0.25),@(0.5,0.5),@(0.75,0.75),@(0.75,0.25),@(0.25,0.75))){
      $point=New-Object BankeWindowProbe+Point;$point.X=[int]($item.x+$item.width*$fraction[0]);$point.Y=[int]($item.y+$item.height*$fraction[1]);$hit=[BankeWindowProbe]::WindowFromPoint($point);$owned=$false
      for($depth=0;$depth -lt 20 -and $hit -ne [IntPtr]::Zero;$depth++){if($hit.ToInt64() -eq $item.handle){$owned=$true;break};$hit=[BankeWindowProbe]::GetParent($hit)}
      if(!$owned){$clear=$false;break}
    }
    if(!$clear){$captures.Add([pscustomobject]@{handle=$item.handle;ok=$false;reason='Window occluded; no screenshot captured'});continue}
    $bitmap=$null; $graphics=$null
    try {
        $bitmap=New-Object Drawing.Bitmap($item.width,$item.height)
        $graphics=[Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($item.x,$item.y,0,0,$bitmap.Size)
        $output=Join-Path $evidence ('banke-external-' + $item.handle + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
        $bitmap.Save($output)
        $captures.Add([pscustomobject]@{handle=$item.handle;file=$output;ok=$true})
    } catch { $captures.Add([pscustomobject]@{handle=$item.handle;ok=$false;error=$_.Exception.Message}) }
    finally { if($graphics){$graphics.Dispose()};if($bitmap){$bitmap.Dispose()} }
}
$result=[pscustomobject]@{at=(Get-Date).ToString('o');enumSucceeded=$enumerated;enumWin32Error=$enumError;processCount=$bankeIds.Count;windows=@($found.ToArray());captures=@($captures.ToArray())}
$result | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $evidence ('native-window-probe-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'))
$result | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $evidence 'native-window-probe.json')
if($previousDpi -ne [IntPtr]::Zero){[void][BankeWindowProbe]::SetThreadDpiAwarenessContext($previousDpi)}
if($Summary){$result.windows=@($result.windows | Where-Object {$_.class -in @('Chrome_WidgetWin_1','#32770')})}
$result | ConvertTo-Json -Depth 5
