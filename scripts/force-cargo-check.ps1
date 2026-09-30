# Raccourci : verification de compilation (cargo check) avec contournement
# des blocages « application control » (erreur 4551) sur les binaires produits.
# Pour lancer l'application : powershell -File scripts\force-cargo.ps1 -Task run
& (Join-Path $PSScriptRoot "force-cargo.ps1") -Task check @args
