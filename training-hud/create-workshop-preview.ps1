$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$output = Join-Path $PSScriptRoot 'dist/workshop-preview.jpg'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 512, 512
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$resources = [System.Collections.Generic.List[System.IDisposable]]::new()
try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#111923'))
    $accent = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#89d3ff'))
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f0f4f8'))
    $muted = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#9eb6cc'))
    $surface = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#273d50'))
    $large = [System.Drawing.Font]::new('Arial', 48, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $medium = [System.Drawing.Font]::new('Arial', 23, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $small = [System.Drawing.Font]::new('Arial', 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    foreach ($resource in @($accent, $white, $muted, $surface, $large, $medium, $small)) { $resources.Add($resource) }
    $graphics.FillRectangle($accent, 40, 42, 64, 5)
    $graphics.DrawString('CS2 / COMMUNITY SERVER', $small, $muted, 40, 67)
    $graphics.DrawString('Playbook', $large, $white, 36, 116)
    $graphics.DrawString('TRAINING HUD', $medium, $accent, 40, 180)
    $graphics.FillRectangle($surface, 40, 252, 432, 130)
    $graphics.FillRectangle($accent, 40, 252, 4, 130)
    $graphics.DrawString('LINEUPS', $medium, $white, 61, 270)
    $graphics.DrawString('PRACTICE TOOLS', $medium, $white, 61, 306)
    $graphics.DrawString('PERSONAL SETTINGS', $small, $muted, 63, 348)
    $graphics.DrawString('Client assets / Requires server plugin', $small, $muted, 40, 440)
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Jpeg)
} finally {
    foreach ($resource in $resources) { $resource.Dispose() }
    $graphics.Dispose()
    $bitmap.Dispose()
}
Write-Output $output
