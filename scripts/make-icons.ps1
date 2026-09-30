# Génère les icônes de l'application Gestion RH (PNG + ICO)
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "src-tauri\icons"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

function New-BitmapIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [int]([math]::Max(1, $size * 0.03))
    $r = [int]($size * 0.22)
    $rect = New-Object System.Drawing.Rectangle($pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad))

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 99, 102, 241),
        [System.Drawing.Color]::FromArgb(255, 13, 148, 136),
        45.0)
    $g.FillPath($brush, $path)
    $g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), ([math]::Max(1, $size / 64)))), $path)

    $fontSize = [single]($size * 0.40)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.DrawString("RH", $font, $shadow, (New-Object System.Drawing.RectangleF(($rect.X + $size * 0.02), ($rect.Y + $size * 0.03), $rect.Width, $rect.Height)), $fmt)
    $g.DrawString("RH", $font, $white, (New-Object System.Drawing.RectangleF($rect.X, $rect.Y, $rect.Width, $rect.Height)), $fmt)

    $g.Dispose()
    return $bmp
}

# PNG simples
foreach ($s in @(32, 128, 256)) {
    $bmp = New-BitmapIcon $s
    $bmp.Save((Join-Path $iconDir "$($s)x$($s).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}
$defaultBmp = New-BitmapIcon 512
$defaultBmp.Save((Join-Path $iconDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$defaultBmp.Dispose()

# ICO contenant les tailles 16 à 256 (PNG compressé)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBlobs = @()
foreach ($s in $sizes) {
    $bmp = New-BitmapIcon $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngBlobs += , $ms.ToArray()
    $ms.Dispose()
}

$fs = New-Object System.IO.FileStream((Join-Path $iconDir "icon.ico"), [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)              # reserved
$bw.Write([uint16]1)              # type = icon
$bw.Write([uint16]$sizes.Count)   # count
$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $entrySize = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$entrySize)
    $bw.Write([byte]$entrySize)
    $bw.Write([byte]0)            # palette
    $bw.Write([byte]0)            # reserved
    $bw.Write([uint16]1)          # planes
    $bw.Write([uint16]32)         # bpp
    $bw.Write([uint32]$pngBlobs[$i].Length)
    $bw.Write([uint32]$offset)
    $offset += $pngBlobs[$i].Length
}
foreach ($blob in $pngBlobs) { $bw.Write($blob) }
$bw.Flush()
$fs.Close()

Write-Output "Icônes générées dans $iconDir"
