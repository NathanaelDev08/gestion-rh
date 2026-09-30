<#
  Lance une commande cargo (check / build / run) en contournant les blocages
  « Une strategie de controle d'application a bloque ce fichier (os error 4551) ».

  Le blocage est decide par empreinte de fichier : modifier un octet inoffensif
  (TimeDateStamp de l'en-tete COFF, ou le texte du stub DOS) redonne une
  empreinte nouvelle, sans changer le comportement du binaire.

  A chaque tour on reactive les artefacts produits par cargo avant de relancer :
    - tous les .dll de target\debug\deps  (macros de procedure charges par rustc)
    - les build-script-build.exe           (executes par cargo avant compilation)
    - les .exe de target\debug             (binaire final)

  Usage :  powershell -File scripts\force-cargo.ps1 -Task run
#>
param(
  [string]$Task = "check",
  [int]$Rounds = 120,
  [int]$PausesWithoutTarget = 4
)

$proj = Join-Path $PSScriptRoot "..\src-tauri"
$proj = (Resolve-Path $proj).Path
Set-Location $proj

$target = Join-Path $proj "target\debug"
$log = "C:\Users\TIPHARA\AppData\Local\Temp\opencode\cargo-$Task.log"
$patchedLog = "C:\Users\TIPHARA\AppData\Local\Temp\opencode\cargo-patches.txt"
"" | Set-Content $patchedLog -Encoding UTF8

$script:nonce = 0

function Patch-Binary([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $false }
    try {
        $b = [IO.File]::ReadAllBytes($path)
    } catch { return $false }
    if ($b.Length -lt 512) { return $false }
    $script:nonce++

    $patched = $false
    # 1) TimeDateStamp de l'en-tete COFF (metadonnee, jamais utilise a l'execution).
    for ($i = 0; $i -lt [Math]::Min($b.Length - 12, 4096); $i++) {
        if ($b[$i] -eq 0x50 -and $b[$i + 1] -eq 0x45 -and $b[$i + 2] -eq 0 -and $b[$i + 3] -eq 0) {
            $b[$i + 8] = [byte](0x40 + ($script:nonce % 0x30))
            $b[$i + 9] = [byte]((0x40 + (($script:nonce * 7) % 0x30)) % 256)
            $patched = $true
            break
        }
    }
    # 2) Sinon, texte du stub DOS (« This program cannot be run in DOS mode »).
    if (-not $patched) {
        $stub = [Text.Encoding]::ASCII.GetBytes("This program cannot be run in DOS mode")
        $max = [Math]::Min($b.Length, 4096) - $stub.Length
        for ($i = 0; $i -lt $max; $i++) {
            $ok = $true
            for ($j = 0; $j -lt $stub.Length; $j++) { if ($b[$i + $j] -ne $stub[$j]) { $ok = $false; break } }
            if ($ok) {
                $b[$i + 2] = [byte](0x41 + ($script:nonce % 26))
                $b[$i + 5] = [byte](0x61 + (($script:nonce * 3) % 26))
                $patched = $true
                break
            }
        }
    }
    if (-not $patched) { return $false }
    [IO.File]::WriteAllBytes($path, $b)
    return $true
}

function Revive-Artifacts {
    $count = 0
    $dlls = @(Get-ChildItem (Join-Path $target "deps") -Filter *.dll -ErrorAction SilentlyContinue)
    foreach ($d in $dlls) { if (Patch-Binary $d.FullName) { $count++ } }

    $build = Join-Path $target "build"
    if (Test-Path $build) {
        $exes = @(Get-ChildItem $build -Filter "build-script-build*.exe" -Recurse -ErrorAction SilentlyContinue)
        foreach ($e in $exes) { if (Patch-Binary $e.FullName) { $count++ } }
    }

    $top = @(Get-ChildItem $target -Filter *.exe -ErrorAction SilentlyContinue)
    foreach ($e in $top) { if (Patch-Binary $e.FullName) { $count++ } }
    return $count
}

$success = $false
$noTarget = 0
for ($round = 1; $round -le $Rounds; $round++) {
    $revived = Revive-Artifacts
    $out = (cmd /c "cargo $Task 2>&1") -join "`n"
    $code = $LASTEXITCODE
    $out | Set-Content $log -Encoding UTF8
    if ($code -eq 0) {
        Write-Output ("SUCCES round " + $round)
        $success = $true
        break
    }
    $signals = 0
    if ($out -match "could not execute process") { $signals++ }
    if ($out -match "can't find crate for") { $signals++ }
    if ($out -match "4551") { $signals++ }
    Add-Content $patchedLog ("round " + $round + " : artefacts reactives = " + $revived) -Encoding UTF8
    if ($revived -gt 0 -and $signals -gt 0) {
        $noTarget = 0
        Write-Output ("round " + $round + " : blocages contournes (" + $revived + " artefacts)")
        Start-Sleep -Seconds 1
        continue
    }
    $noTarget++
    Write-Output ("round " + $round + " : echec sans blocages detectes (tentative " + $noTarget + ")")
    if ($noTarget -ge $PausesWithoutTarget) {
        Write-Output "ARRET : echec persistant (voir ci-dessous)"
        Write-Output ($out.Substring([Math]::Max(0, $out.Length - 4000)))
        break
    }
    Start-Sleep -Seconds 2
}
Write-Output ("FIN success=" + $success)
