$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BankeDesktopKeys {
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
'@
try {
    [BankeDesktopKeys]::keybd_event(0x5b,0,0,[UIntPtr]::Zero)
    [BankeDesktopKeys]::keybd_event(0x44,0,0,[UIntPtr]::Zero)
} finally {
    [BankeDesktopKeys]::keybd_event(0x44,0,2,[UIntPtr]::Zero)
    [BankeDesktopKeys]::keybd_event(0x5b,0,2,[UIntPtr]::Zero)
}
Start-Sleep -Milliseconds 700
'ACTUAL_WIN_D_SENT'
