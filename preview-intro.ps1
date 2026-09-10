$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $projectRoot

try {
    Write-Host 'Starte MAR-Helper Intro-Vorschau ...'
    Write-Host 'Mit dem Button, einem Klick auf die Vorschau oder der Taste R neu starten. Mit Strg+C beenden.'
    & npm.cmd exec vite -- --host 127.0.0.1 --port 4173 --open /intro-preview.html
}
finally {
    Pop-Location
}
