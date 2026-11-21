Add-Type -AssemblyName System.Drawing

$photoDirectory = Join-Path $PSScriptRoot 'photos'
$compressedDirectory = Join-Path $photoDirectory 'compressed'
$maxDimension = 1600
$jpegQuality = 82L

if (-not (Test-Path -LiteralPath $compressedDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $compressedDirectory | Out-Null
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' } |
    Select-Object -First 1
$qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality

Get-ChildItem -LiteralPath $photoDirectory -File |
    Where-Object { $_.Extension -match '^\.(jpe?g|png)$' } |
    ForEach-Object {
        $sourceImage = $null
        $outputBitmap = $null
        $graphics = $null
        $encoderParameters = $null
        try {
            $sourceImage = [System.Drawing.Image]::FromFile($_.FullName)
            try {
                $orientation = [int]$sourceImage.GetPropertyItem(0x0112).Value[0]
                switch ($orientation) {
                    2 { $sourceImage.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
                    3 { $sourceImage.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
                    4 { $sourceImage.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipY) }
                    5 { $sourceImage.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipX) }
                    6 { $sourceImage.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
                    7 { $sourceImage.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipX) }
                    8 { $sourceImage.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
                }
                $sourceImage.RemovePropertyItem(0x0112)
            } catch { }

            $scale = [Math]::Min(1.0, [Math]::Min($maxDimension / [double]$sourceImage.Width, $maxDimension / [double]$sourceImage.Height))
            $width = [Math]::Max(1, [int][Math]::Round($sourceImage.Width * $scale))
            $height = [Math]::Max(1, [int][Math]::Round($sourceImage.Height * $scale))
            $isPng = $_.Extension -ieq '.png'
            $pixelFormat = if ($isPng) { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb } else { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb }
            $outputBitmap = New-Object System.Drawing.Bitmap($width, $height, $pixelFormat)
            $outputBitmap.SetResolution(96, 96)
            $graphics = [System.Drawing.Graphics]::FromImage($outputBitmap)
            if ($isPng) {
                $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $graphics.Clear([System.Drawing.Color]::Transparent)
            } else {
                $graphics.Clear([System.Drawing.Color]::Black)
            }
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($sourceImage, 0, 0, $width, $height)

            $extension = if ($isPng) { '.png' } else { '.jpg' }
            $outputName = [IO.Path]::GetFileNameWithoutExtension($_.Name).ToLowerInvariant() + $extension
            $outputPath = Join-Path $compressedDirectory $outputName
            if ($isPng) {
                $outputBitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
            } else {
                $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
                $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($qualityEncoder, $jpegQuality)
                $outputBitmap.Save($outputPath, $jpegCodec, $encoderParameters)
            }
            $outputFile = Get-Item -LiteralPath $outputPath
            if ($outputFile.Length -ge $_.Length) {
                Copy-Item -LiteralPath $_.FullName -Destination $outputPath -Force
                $outputFile = Get-Item -LiteralPath $outputPath
            }
            [pscustomobject]@{ Original = $_.Name; Compressed = $outputName; OriginalKB = [Math]::Round($_.Length / 1KB); CompressedKB = [Math]::Round($outputFile.Length / 1KB) }
        } finally {
            if ($encoderParameters) { $encoderParameters.Dispose() }
            if ($graphics) { $graphics.Dispose() }
            if ($outputBitmap) { $outputBitmap.Dispose() }
            if ($sourceImage) { $sourceImage.Dispose() }
        }
    } | Format-Table -AutoSize
