[CmdletBinding()]
param(
    [ValidateSet("x64", "arm64", "ia32")]
    [string]$Architecture = "x64",

    [switch]$InstallDependencies,

    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageFile = Join-Path $ProjectRoot "package.json"
$NodeModules = Join-Path $ProjectRoot "node_modules"
$ReleaseDirectory = Join-Path $ProjectRoot "release"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Befehl fehlgeschlagen ($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

if (-not (Test-Path -LiteralPath $PackageFile -PathType Leaf)) {
    throw "package.json wurde nicht gefunden: $PackageFile"
}

$NpmCommand = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
$NpxCommand = (Get-Command "npx.cmd" -ErrorAction SilentlyContinue).Source

if (-not $NpmCommand -or -not $NpxCommand) {
    throw "Node.js mit npm/npx wurde nicht gefunden. Installiere Node.js 20 oder neuer."
}

Push-Location $ProjectRoot
try {
    Write-Host ""
    Write-Host "MAR Helper - NSIS Installer Build" -ForegroundColor Cyan
    Write-Host "Projekt:      $ProjectRoot"
    Write-Host "Architektur:  $Architecture"
    Write-Host ""

    if ($InstallDependencies -or -not (Test-Path -LiteralPath $NodeModules -PathType Container)) {
        Write-Host "[1/4] Installiere Abhängigkeiten mit npm ci ..." -ForegroundColor Cyan
        Invoke-NativeCommand $NpmCommand "ci"
    }
    else {
        Write-Host "[1/4] Abhängigkeiten sind vorhanden (mit -InstallDependencies neu installieren)." -ForegroundColor DarkGray
    }

    if ($SkipTests) {
        Write-Host "[2/4] Tests übersprungen." -ForegroundColor DarkGray
    }
    else {
        Write-Host "[2/4] Führe Timer- und Persistenztests aus ..." -ForegroundColor Cyan
        Invoke-NativeCommand $NpmCommand "test"
    }

    Write-Host "[3/4] Erstelle Produktions-Build ..." -ForegroundColor Cyan
    Invoke-NativeCommand $NpmCommand "run" "build"

    Write-Host "[4/4] Erzeuge NSIS-Installer ..." -ForegroundColor Cyan
    $ArchitectureFlag = "--$Architecture"
    Invoke-NativeCommand $NpxCommand "--no-install" "electron-builder" "--win" "nsis" $ArchitectureFlag

    $Installers = Get-ChildItem -LiteralPath $ReleaseDirectory -Filter "*.exe" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*Setup*" } |
        Sort-Object LastWriteTime -Descending

    if (-not $Installers) {
        throw "electron-builder wurde beendet, aber unter '$ReleaseDirectory' wurde kein NSIS-Installer gefunden."
    }

    Write-Host ""
    Write-Host "Build erfolgreich." -ForegroundColor Green
    foreach ($Installer in $Installers) {
        $SizeMb = [Math]::Round($Installer.Length / 1MB, 1)
        Write-Host "Installer: $($Installer.FullName) ($SizeMb MB)" -ForegroundColor Green
    }
}
finally {
    Pop-Location
}
