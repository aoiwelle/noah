# Noah Windows Release Build Script
# Usage: powershell -File C:\Users\xulea\src\itman\build-windows.ps1

$env:PATH = "C:\Users\xulea\AppData\Roaming\nvm\v22.13.1;C:\Users\xulea\AppData\Local\pnpm;C:\Users\xulea\.cargo\bin;$env:PATH"

Set-Location C:\Users\xulea\src\itman

Write-Host "==> Pulling latest..."
git pull

Write-Host "==> Building..."
node scripts/release.mjs --build

Write-Host ""
Write-Host "==> Done! Artifacts are in target\release\bundle\"
Write-Host "To get them from Mac:"
Write-Host "  scp xulea@100.87.199.115:C:/Users/xulea/src/itman/target/release/bundle/nsis/*.exe ."
Write-Host "  scp xulea@100.87.199.115:C:/Users/xulea/src/itman/target/release/bundle/msi/*.msi ."
Write-Host "Then upload:"
Write-Host "  gh release upload vX.Y.Z Noah_*.exe Noah_*.msi --clobber"
