$ErrorActionPreference='Stop'
# Show the actual desktop without toggling previously minimized windows back.
$desktopShell=New-Object -ComObject Shell.Application
$desktopShell.MinimizeAll()
Start-Sleep -Milliseconds 500
'ACTUAL_DESKTOP_SHOWN_WITH_MINIMIZE_ALL'
