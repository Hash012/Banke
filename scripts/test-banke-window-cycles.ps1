param([ValidateRange(1,10)][int]$Count=10)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$root=Split-Path -Parent $PSScriptRoot
$active=Get-Content -Raw -LiteralPath (Join-Path $root '.local/active-run.json') | ConvertFrom-Json
function Read-View {
 $result=& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action snapshot | ConvertFrom-Json
 if(!$result.ok){throw 'Snapshot failed'}
 & (Join-Path $PSScriptRoot 'inspect-banke-desktop.ps1') -Summary | Out-Null
 return $result.result
}
& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action editor | Out-Null
& (Join-Path $PSScriptRoot 'ensure-desktop.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'restore-banke-editor.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action editor | Out-Null
$results=New-Object System.Collections.Generic.List[object]
for($cycle=1;$cycle -le $Count;$cycle++){
 & (Join-Path $PSScriptRoot 'ensure-desktop.ps1') | Out-Null
 & (Join-Path $PSScriptRoot 'run-banke-diagnostic.ps1') -Action editor | Out-Null
 & (Join-Path $PSScriptRoot 'restore-banke-editor.ps1') | Out-Null
 & (Join-Path $PSScriptRoot 'focus-banke-editor.ps1') | Out-Null
 $normal=Read-View
 if($normal.status.mode -ne 'window'){throw 'Expected ordinary editor'}
 & (Join-Path $PSScriptRoot 'click-banke-control.ps1') -Control desktopModeButton | Out-Null
 Start-Sleep -Milliseconds 500
 & (Join-Path $PSScriptRoot 'ensure-desktop.ps1') | Out-Null
 $desktop=Read-View
 if($desktop.status.mode -ne 'desktop' -or !$desktop.status.connected){throw 'Pin failed'}
 $widget=@($desktop.windows | Where-Object {$_.role -eq 'desktop-widget'})[0]
 if(!$widget.visible -or $widget.dom.events -le 0){throw 'Widget is not visible/rendered'}
 $desktopNative=Get-Content -Raw -LiteralPath (Join-Path $root '.local/evidence/native-window-probe.json') | ConvertFrom-Json
 $external=@($desktopNative.captures | Where-Object {$_.handle -eq [long]$widget.hwnd})[0]
 & (Join-Path $PSScriptRoot 'click-banke-control.ps1') -Control desktopModeButton | Out-Null
 Start-Sleep -Milliseconds 300
 $restored=Read-View
 if($restored.status.mode -ne 'window' -or !@($restored.windows | Where-Object {$_.role -eq 'editor' -and $_.visible}).Count){throw 'Return failed'}
 $results.Add([pscustomobject]@{cycle=$cycle;pin=$true;return=$true;method='Actual Windows pointer input';widgetHwnd=$widget.hwnd;internal=Join-Path $active.run $widget.image;external=$external.file;widgetDOMEvents=$widget.dom.events})
 $results.ToArray() | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $active.run 'native-pointer-cycles.json')
 [pscustomobject]@{cycle=$cycle;pin='PASS';return='PASS'} | ConvertTo-Json -Compress
}
$events=@(Get-Content -Encoding UTF8 -LiteralPath (Join-Path $active.run 'runtime.jsonl') | ForEach-Object {$_|ConvertFrom-Json})
[pscustomobject]@{cycles=$results.Count;exceptions=@($events | Where-Object {$_.event -in @('uncaught-exception','preload-error','renderer-gone','did-fail-load','ipc-error')}).Count;error1400=@($events|Where-Object {$_.error -match '1400'}).Count} | ConvertTo-Json
