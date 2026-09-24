Add-Type -AssemblyName System.Drawing

function New-ReferenceBoard {
    param(
        [string[]]$Paths,
        [string]$OutputPath,
        [int]$StartIndex
    )

    $columns = 2
    $rows = [Math]::Ceiling($Paths.Count / $columns)
    $cellWidth = 900
    $cellHeight = 600
    $labelHeight = 48
    $canvas = New-Object System.Drawing.Bitmap ($columns * $cellWidth), ($rows * $cellHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::FromArgb(244, 246, 250))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $font = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 32, 54))

    for ($i = 0; $i -lt $Paths.Count; $i++) {
        $image = [System.Drawing.Image]::FromFile($Paths[$i])
        try {
            $column = $i % $columns
            $row = [Math]::Floor($i / $columns)
            $originX = $column * $cellWidth
            $originY = $row * $cellHeight
            $graphics.DrawString(('REFERENCE {0}' -f ($StartIndex + $i)), $font, $brush, $originX + 20, $originY + 10)

            $availableWidth = $cellWidth - 40
            $availableHeight = $cellHeight - $labelHeight - 30
            $scale = [Math]::Min($availableWidth / $image.Width, $availableHeight / $image.Height)
            $drawWidth = [int]($image.Width * $scale)
            $drawHeight = [int]($image.Height * $scale)
            $drawX = $originX + [int](($cellWidth - $drawWidth) / 2)
            $drawY = $originY + $labelHeight + [int](($availableHeight - $drawHeight) / 2)
            $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
        }
        finally {
            $image.Dispose()
        }
    }

    $directory = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
}

$references = @(
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-c58a0ed5-329a-47e8-8bb3-61195ec53556.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-475fe8f4-8fbc-43c5-91f5-3c2737f4f05b.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-418b362f-70f3-48b9-b883-b4c38b257ee9.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-15967170-5459-4bca-b314-de56421c37df.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-d9515091-cbbc-484c-b3fd-01a60aca0b60.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-3ddafb88-7355-4977-80af-0faf20c39179.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-2ba8a76e-748a-455a-a9d9-358558861ec7.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-a508cd03-739f-4ba4-8354-3a19c753f50a.png',
    'C:\Users\30916\AppData\Local\Temp\codex-clipboard-af7c8db9-c6e4-4905-a1bf-4a39ab40bb4d.png'
)

New-ReferenceBoard -Paths $references[0..4] -OutputPath 'D:\dsharness\.impeccable\mocks\references\reference-board-1-5.png' -StartIndex 1
New-ReferenceBoard -Paths $references[5..8] -OutputPath 'D:\dsharness\.impeccable\mocks\references\reference-board-6-9.png' -StartIndex 6
