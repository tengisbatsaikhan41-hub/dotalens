# DotaLens.exe-г build хийнэ: app/ доторх бүх файлыг exe-д embed хийж, dist/DotaLens.exe үүсгэнэ.
# Ажиллуулах: powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw '.NET Framework 4 C# compiler (csc.exe) олдсонгүй.' }

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$appDir = Join-Path $root 'app'
$res = Get-ChildItem $appDir -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($appDir.Length + 1).Replace('\', '/')
  "/resource:`"$($_.FullName)`",app/$rel"
}
$out = Join-Path $dist 'DotaLens.exe'
$cscArgs = @('/nologo', '/target:winexe', '/optimize+', '/codepage:65001', "/out:$out",
  "/win32icon:$(Join-Path $root 'launcher\dotalens.ico')",
  '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Management.dll') + $res + @((Join-Path $root 'launcher\DotaLens.cs'))
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw "Build амжилтгүй ($LASTEXITCODE)" }
Write-Host "OK: $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
