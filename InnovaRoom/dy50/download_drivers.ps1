# PowerShell helper para baixar drivers DY50 (Windows)
# Uso: editar $DriverUrl e executar como Administrador

$ErrorActionPreference = 'Stop'
$DriverUrl = 'https://example.com/path/to/dy50-drivers.zip'  # <-- substitua pelo URL oficial do fabricante
$OutDir = Join-Path -Path $PSScriptRoot -ChildPath 'drivers'
$OutZip = Join-Path -Path $OutDir -ChildPath 'dy50_drivers.zip'

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

Write-Host "Baixando driver de:`n $DriverUrl`npara:`n $OutZip" -ForegroundColor Cyan

try {
    Invoke-WebRequest -Uri $DriverUrl -OutFile $OutZip -UseBasicParsing -Verbose
    Write-Host "Download concluído." -ForegroundColor Green

    if ($OutZip -match '\.zip$') {
        Write-Host "Extraindo ZIP..." -ForegroundColor Cyan
        Expand-Archive -Path $OutZip -DestinationPath $OutDir -Force
        Write-Host "Extração concluída em: $OutDir" -ForegroundColor Green
    } else {
        Write-Host "Arquivo baixado (não é ZIP). Verifique o instalador em: $OutZip" -ForegroundColor Yellow
    }

    Write-Host "Abra o instalador/extração e execute como Administrador." -ForegroundColor Green
} catch {
    Write-Host "Falha ao baixar ou extrair o arquivo: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Pronto. Verifique as instruções no README.txt dentro da pasta dy50." -ForegroundColor Cyan
