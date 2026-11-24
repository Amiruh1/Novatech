# Construye la imagen del backend y la sube a Amazon ECR (el registro de imágenes de AWS).
# App Runner luego la toma de ahí. Ver DESPLIEGUE.md.
#
# Requisitos: Docker Desktop encendido y la CLI de AWS con credenciales (aws configure) de un usuario
# con permisos de ECR. Uso, desde la carpeta backend:
#   powershell -ExecutionPolicy Bypass -File scripts\subir-imagen.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\subir-imagen.ps1 -Region us-east-1 -Repo novatech-backend
param(
  [string]$Region = 'us-east-1',
  [string]$Repo = 'novatech-backend'
)
# 'Continue': docker y aws escriben avisos por la salida de error y PowerShell 5.1 los tomaría como
# fallos. Cada paso se comprueba por su código de salida (función Revisar).
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Paso($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Revisar($t) { if ($LASTEXITCODE -ne 0) { throw "Falló: $t" } }

Paso 'Cuenta de AWS'
$cuenta = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0 -or -not $cuenta) { throw 'La CLI de AWS no tiene credenciales. Ejecuta: aws configure' }
$registro = "$cuenta.dkr.ecr.$Region.amazonaws.com"
$etiqueta = Get-Date -Format 'yyyyMMdd-HHmm'
Write-Host "Cuenta $cuenta · región $Region · repositorio $Repo"

Paso 'Repositorio en ECR (se crea si no existe)'
# Se lista filtrando por nombre: si no existe devuelve vacío (preguntar por uno inexistente da error).
$uri = aws ecr describe-repositories --region $Region --query "repositories[?repositoryName=='$Repo'].repositoryUri" --output text
Revisar 'consultar los repositorios de ECR (¿el usuario tiene permisos de ECR?)'
if ($uri) { Write-Host "Ya existe: $uri" } else {
  aws ecr create-repository --repository-name $Repo --region $Region --image-scanning-configuration scanOnPush=true --query 'repository.repositoryUri' --output text
  Revisar 'crear el repositorio'
}

Paso 'Construir la imagen'
# linux/amd64: es lo que ejecuta App Runner (importa si tu PC es ARM).
docker build --platform linux/amd64 -t "${Repo}:$etiqueta" .
Revisar 'docker build'

Paso 'Subir a ECR'
# La tubería de cmd pasa la clave tal cual (la de PowerShell 5.1 a veces la altera y ECR responde 400).
  cmd /c "aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registro"
Revisar 'iniciar sesión en ECR'
foreach ($t in $etiqueta, 'latest') {
  docker tag "${Repo}:$etiqueta" "$registro/${Repo}:$t"
  docker push "$registro/${Repo}:$t"
  Revisar "subir la etiqueta $t"
}

Write-Host "`nListo. Imagen para App Runner:" -ForegroundColor Green
Write-Host "  $registro/${Repo}:latest"
