Add-Type -AssemblyName System.Drawing

$manualDir = 'c:\Users\Markus\TOP2-App\App\assets\tera-scanner\manual'
$outDir = 'c:\Users\Markus\TOP2-App\App\assets\tera-scanner\codes'
$metaPath = 'c:\Users\Markus\TOP2-App\App\assets\tera-scanner\codes\manifest.json'

if (!(Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

Get-ChildItem -Path $outDir -File -Filter '*.png' | Remove-Item -Force

function Merge-Boxes {
    param([System.Collections.ArrayList]$Boxes)

    $merged = New-Object System.Collections.ArrayList

    foreach ($b in $Boxes) {
        $current = [pscustomobject]@{
            x = $b.x
            y = $b.y
            w = $b.w
            h = $b.h
        }

        $changed = $true
        while ($changed) {
            $changed = $false
            for ($i = $merged.Count - 1; $i -ge 0; $i--) {
                $m = $merged[$i]
                $ax1 = $current.x
                $ay1 = $current.y
                $ax2 = $current.x + $current.w
                $ay2 = $current.y + $current.h

                $bx1 = $m.x
                $by1 = $m.y
                $bx2 = $m.x + $m.w
                $by2 = $m.y + $m.h

                $ix1 = [Math]::Max($ax1, $bx1)
                $iy1 = [Math]::Max($ay1, $by1)
                $ix2 = [Math]::Min($ax2, $bx2)
                $iy2 = [Math]::Min($ay2, $by2)

                $intersects = ($ix2 - $ix1) -ge 0 -and ($iy2 - $iy1) -ge 0
                if ($intersects) {
                    $nx1 = [Math]::Min($ax1, $bx1)
                    $ny1 = [Math]::Min($ay1, $by1)
                    $nx2 = [Math]::Max($ax2, $bx2)
                    $ny2 = [Math]::Max($ay2, $by2)

                    $current = [pscustomobject]@{
                        x = $nx1
                        y = $ny1
                        w = $nx2 - $nx1
                        h = $ny2 - $ny1
                    }

                    $merged.RemoveAt($i)
                    $changed = $true
                }
            }
        }

        [void]$merged.Add($current)
    }

    return $merged
}

function Get-Code-Boxes {
    param(
        [System.Drawing.Bitmap]$Original,
        [int]$Scale = 3,
        [int]$Threshold = 145
    )

    $smallW = [Math]::Max(1, [int]($Original.Width / $Scale))
    $smallH = [Math]::Max(1, [int]($Original.Height / $Scale))
    $small = New-Object System.Drawing.Bitmap($Original, $smallW, $smallH)

    $len = $smallW * $smallH
    $dark = New-Object 'bool[]' $len

    for ($y = 0; $y -lt $smallH; $y++) {
        for ($x = 0; $x -lt $smallW; $x++) {
            $c = $small.GetPixel($x, $y)
            $lum = ([int]$c.R + [int]$c.G + [int]$c.B) / 3
            if ($lum -lt $Threshold) {
                $dark[$y * $smallW + $x] = $true
            }
        }
    }

    function Dilate-Mask {
        param(
            [bool[]]$InputMask,
            [int]$W,
            [int]$H,
            [int]$Rx,
            [int]$Ry
        )

        $out = New-Object 'bool[]' ($W * $H)
        for ($yy = 0; $yy -lt $H; $yy++) {
            for ($xx = 0; $xx -lt $W; $xx++) {
                if (-not $InputMask[$yy * $W + $xx]) { continue }
                for ($dy = -$Ry; $dy -le $Ry; $dy++) {
                    $ny = $yy + $dy
                    if ($ny -lt 0 -or $ny -ge $H) { continue }
                    for ($dx = -$Rx; $dx -le $Rx; $dx++) {
                        $nx = $xx + $dx
                        if ($nx -lt 0 -or $nx -ge $W) { continue }
                        $out[$ny * $W + $nx] = $true
                    }
                }
            }
        }
        return $out
    }

    function Collect-Components {
        param(
            [bool[]]$Mask,
            [bool[]]$DensityMask,
            [int]$W,
            [int]$H,
            [scriptblock]$Filter
        )

        $visited = New-Object 'bool[]' ($W * $H)
        $queueX = New-Object 'int[]' ($W * $H)
        $queueY = New-Object 'int[]' ($W * $H)
        $ret = New-Object System.Collections.ArrayList

        for ($yy = 0; $yy -lt $H; $yy++) {
            for ($xx = 0; $xx -lt $W; $xx++) {
                $idx = $yy * $W + $xx
                if (-not $Mask[$idx] -or $visited[$idx]) { continue }

                $head = 0
                $tail = 0
                $queueX[$tail] = $xx
                $queueY[$tail] = $yy
                $tail++
                $visited[$idx] = $true

                $minX = $xx; $maxX = $xx
                $minY = $yy; $maxY = $yy

                while ($head -lt $tail) {
                    $cx = $queueX[$head]
                    $cy = $queueY[$head]
                    $head++

                    if ($cx -lt $minX) { $minX = $cx }
                    if ($cx -gt $maxX) { $maxX = $cx }
                    if ($cy -lt $minY) { $minY = $cy }
                    if ($cy -gt $maxY) { $maxY = $cy }

                    for ($dy = -1; $dy -le 1; $dy++) {
                        $ny = $cy + $dy
                        if ($ny -lt 0 -or $ny -ge $H) { continue }
                        for ($dx = -1; $dx -le 1; $dx++) {
                            $nx = $cx + $dx
                            if ($nx -lt 0 -or $nx -ge $W) { continue }
                            $nidx = $ny * $W + $nx
                            if ($visited[$nidx] -or -not $Mask[$nidx]) { continue }
                            $visited[$nidx] = $true
                            $queueX[$tail] = $nx
                            $queueY[$tail] = $ny
                            $tail++
                        }
                    }
                }

                $bw = $maxX - $minX + 1
                $bh = $maxY - $minY + 1
                $area = $bw * $bh
                if ($area -le 0) { continue }

                $darkCount = 0
                for ($ry = $minY; $ry -le $maxY; $ry++) {
                    for ($rx = $minX; $rx -le $maxX; $rx++) {
                        if ($DensityMask[$ry * $W + $rx]) { $darkCount++ }
                    }
                }

                $density = $darkCount / [double]$area
                $ratio = $bw / [double]$bh

                $keep = & $Filter $bw $bh $ratio $density
                if (-not $keep) { continue }

                [void]$ret.Add([pscustomobject]@{ x = $minX; y = $minY; w = $bw; h = $bh })
            }
        }

        return $ret
    }

    function Is-BarcodeLike {
        param(
            [pscustomobject]$Box,
            [bool[]]$DensityMask,
            [int]$W,
            [int]$H
        )

        if ($Box.h -lt 18) { return $false }

        $strongCols = 0
        for ($cx = $Box.x; $cx -lt ($Box.x + $Box.w); $cx++) {
            if ($cx -lt 0 -or $cx -ge $W) { continue }
            $colDark = 0
            for ($cy = $Box.y; $cy -lt ($Box.y + $Box.h); $cy++) {
                if ($cy -lt 0 -or $cy -ge $H) { continue }
                if ($DensityMask[$cy * $W + $cx]) { $colDark++ }
            }
            $colRatio = $colDark / [double][Math]::Max(1, $Box.h)
            if ($colRatio -ge 0.55) { $strongCols++ }
        }

        $strongRatio = $strongCols / [double][Math]::Max(1, $Box.w)
        return $strongRatio -ge 0.18
    }

    $qrMask = Dilate-Mask -InputMask $dark -W $smallW -H $smallH -Rx 1 -Ry 1
    $barMask = Dilate-Mask -InputMask $dark -W $smallW -H $smallH -Rx 3 -Ry 1

    $qrBoxes = Collect-Components -Mask $qrMask -DensityMask $dark -W $smallW -H $smallH -Filter {
        param($bw, $bh, $ratio, $density)
        return ($bw -ge 34 -and $bw -le 140 -and $bh -ge 34 -and $bh -le 150 -and $ratio -ge 0.72 -and $ratio -le 1.35 -and $density -ge 0.22 -and $density -le 0.78)
    }

    $barBoxes = Collect-Components -Mask $barMask -DensityMask $dark -W $smallW -H $smallH -Filter {
        param($bw, $bh, $ratio, $density)
        return ($bw -ge 75 -and $bw -le 320 -and $bh -ge 14 -and $bh -le 85 -and $ratio -ge 2.1 -and $density -ge 0.15 -and $density -le 0.72)
    }

    $barFiltered = New-Object System.Collections.ArrayList
    foreach ($b in $barBoxes) {
        if (Is-BarcodeLike -Box $b -DensityMask $dark -W $smallW -H $smallH) {
            [void]$barFiltered.Add($b)
        }
    }

    $boxes = New-Object System.Collections.ArrayList
    foreach ($b in $qrBoxes) { [void]$boxes.Add($b) }
    foreach ($b in $barFiltered) { [void]$boxes.Add($b) }

    $boxes = Merge-Boxes -Boxes $boxes

    $final = New-Object System.Collections.ArrayList
    foreach ($b in $boxes) {
        $ox = [Math]::Max(0, ($b.x * $Scale) - 8)
        $oy = [Math]::Max(0, ($b.y * $Scale) - 8)
        $ow = [Math]::Min($Original.Width - $ox, ($b.w * $Scale) + 16)
        $oh = [Math]::Min($Original.Height - $oy, ($b.h * $Scale) + 16)
        if ($ow -lt 50 -or $oh -lt 40) { continue }
        [void]$final.Add([pscustomobject]@{ x = $ox; y = $oy; w = $ow; h = $oh })
    }

    $small.Dispose()
    return $final
}

$files = Get-ChildItem -Path $manualDir -File -Filter '*.jpg' | Sort-Object Name
$manifest = New-Object System.Collections.ArrayList

foreach ($file in $files) {
    if ($file.Length -lt 70000) { continue }

    $pageNum = 0
    if ($file.Name -match 'bilder-(\d+)') {
        $pageNum = [int]$Matches[1]
    }

    $bmp = [System.Drawing.Bitmap]::FromFile($file.FullName)
    $boxes = Get-Code-Boxes -Original $bmp

    # nach Zeile/Spalte sortieren
    $ordered = $boxes | Sort-Object @{Expression = { [int]($_.y / 40) }}, @{Expression = { $_.x }}

    $index = 1
    foreach ($box in $ordered) {
        $cropRect = New-Object System.Drawing.Rectangle($box.x, $box.y, $box.w, $box.h)
        $crop = $bmp.Clone($cropRect, $bmp.PixelFormat)

        $id = ('p{0:D2}_c{1:D3}' -f $pageNum, $index)
        $target = Join-Path $outDir ($id + '.png')
        $crop.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
        $crop.Dispose()

        [void]$manifest.Add([pscustomobject]@{
            id = $id
            page = $pageNum
            index = $index
            file = ('assets/tera-scanner/codes/{0}.png' -f $id)
            x = $box.x
            y = $box.y
            w = $box.w
            h = $box.h
            label = ('Seite {0:D2} - Code {1:D3}' -f $pageNum, $index)
        })

        $index++
    }

    $bmp.Dispose()
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $metaPath -Encoding UTF8
Write-Output ('Exportiert: ' + $manifest.Count + ' Code-Bilder')
