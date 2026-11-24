# Publica el backend en AWS Lambda con una dirección https (Function URL). Sirve para la primera vez
# y para cada actualización. Ver DESPLIEGUE.md.
#
# Qué hace: 1) construye la imagen (Dockerfile.lambda) y la sube a ECR; 2) crea el rol de la función
# (registros + acceso al bucket de imágenes); 3) crea o actualiza la función; 4) carga las variables de
# entorno desde backend\.env; 5) abre la dirección pública y la prueba.
#
# Las variables se leen de .env y van directo a la función: no se muestran en pantalla.
# JWT_SECRET se genera nuevo la primera vez (distinto al de tu PC) y luego se conserva.
#
# Requisitos: Docker Desktop encendido y la CLI de AWS con credenciales (aws configure).
# Uso, desde la carpeta backend:
#   powershell -ExecutionPolicy Bypass -File scripts\desplegar-lambda.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\desplegar-lambda.ps1 -Frontend https://main.xxxx.amplifyapp.com
param(
  [string]$Frontend = '',                 # dirección del frontend (Amplify). Vacío = conservar la que ya tiene
  [string]$Region = 'us-east-1',
  [string]$Repo = 'novatech-backend',
  [string]$Funcion = 'novatech-backend',
  [int]$Memoria = 512,
  [int]$Tiempo = 30
)
# 'Continue': docker y aws escriben avisos por la salida de error y PowerShell 5.1 los tomaría como
# fallos. Cada paso se comprueba por su código de salida (función Revisar).
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Paso($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Revisar($t) { if ($LASTEXITCODE -ne 0) { throw "Falló: $t" } }
$tmp = Join-Path $env:TEMP ("novatech-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
function Json($nombre, $obj) { $f = Join-Path $tmp $nombre; [IO.File]::WriteAllText($f, ($obj | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding $false)); "file://$f" }

try {
  if (-not (Test-Path .env)) { throw 'No existe backend\.env' }
  $Frontend = $Frontend.Trim().TrimEnd('/')
  if ($Frontend -and $Frontend -notmatch '^https://') { throw '-Frontend debe empezar con https://' }

  Paso 'Cuenta de AWS'
  $cuenta = aws sts get-caller-identity --query Account --output text
  if ($LASTEXITCODE -ne 0 -or -not $cuenta) { throw 'La CLI de AWS no tiene credenciales. Ejecuta: aws configure' }
  $registro = "$cuenta.dkr.ecr.$Region.amazonaws.com"
  $etiqueta = 'lambda-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  $imagen = "$registro/${Repo}:$etiqueta"
  Write-Host "Cuenta $cuenta · región $Region · función $Funcion"

  # ---------- 1) Imagen ----------
  Paso 'Repositorio en ECR'
  $uri = aws ecr describe-repositories --region $Region --query "repositories[?repositoryName=='$Repo'].repositoryUri" --output text
  Revisar 'consultar ECR'
  if (-not $uri) { aws ecr create-repository --repository-name $Repo --region $Region --query 'repository.repositoryUri' --output text; Revisar 'crear el repositorio' }

  Paso 'Construir la imagen'
  # --provenance=false: Lambda no acepta las imágenes con «attestations» que Docker agrega por defecto.
  docker build --platform linux/amd64 --provenance=false -f Dockerfile.lambda -t $imagen .
  Revisar 'docker build'

  Paso 'Subir a ECR'
  # La tubería de cmd pasa la clave tal cual (la de PowerShell 5.1 a veces la altera y ECR responde 400).
  cmd /c "aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registro"
  Revisar 'iniciar sesión en ECR'
  docker push $imagen
  Revisar 'subir la imagen'

  # ---------- 2) Rol ----------
  Paso 'Rol de la función'
  $rol = "$Funcion-lambda"
  $rolArn = aws iam get-role --role-name $rol --query 'Role.Arn' --output text 2>$null
  $rolNuevo = $LASTEXITCODE -ne 0
  if ($rolNuevo) {
    $confianza = Json 'confianza.json' @{ Version = '2012-10-17'; Statement = @(@{ Effect = 'Allow'; Principal = @{ Service = 'lambda.amazonaws.com' }; Action = 'sts:AssumeRole' }) }
    $rolArn = aws iam create-role --role-name $rol --assume-role-policy-document $confianza --description 'Backend de NovaTech en Lambda' --query 'Role.Arn' --output text
    Revisar 'crear el rol'
    aws iam attach-role-policy --role-name $rol --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Revisar 'dar permiso de registros al rol'
  }
  Write-Host $rolArn

  # ---------- Variables de entorno (desde .env) ----------
  $vars = [ordered]@{}
  foreach ($linea in Get-Content .env -Encoding UTF8) {
    if ($linea -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
    $k = $Matches[1]; $v = $Matches[2].Trim()
    if ($v -match '^"(.*)"\s*(#.*)?$' -or $v -match "^'(.*)'\s*(#.*)?$") { $v = $Matches[1] } else { $v = ($v -replace '\s+#.*$', '').Trim() }
    if ($v -ne '') { $vars[$k] = $v }
  }
  $bucket = $vars['S3_BUCKET']
  $correoSes = $vars['MAIL_MODE'] -eq 'ses'
  # En Lambda no se cargan: las credenciales y la región las da el rol; el puerto no aplica.
  foreach ($k in 'PORT', 'TRUST_PROXY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION', 'AWS_DEFAULT_REGION', 'S3_ENDPOINT', 'OUTBOX_DIR', 'JWT_SECRET', 'FRONTEND_ORIGINS', 'FRONTEND_URL') { $vars.Remove($k) }
  if ($vars['MAIL_MODE'] -eq 'console') { throw 'MAIL_MODE=console no sirve en Lambda (no puede escribir archivos). Usa smtp o ses en .env.' }

  # Permisos del rol sobre el bucket de imágenes (y SES si el correo sale por ahí). Se reescribe siempre.
  $permisos = @()
  if ($bucket) {
    $permisos += @{ Effect = 'Allow'; Action = @('s3:PutObject', 's3:GetObject', 's3:DeleteObject'); Resource = "arn:aws:s3:::$bucket/*" }
    $permisos += @{ Effect = 'Allow'; Action = 's3:ListBucket'; Resource = "arn:aws:s3:::$bucket" }
  }
  if ($correoSes) { $permisos += @{ Effect = 'Allow'; Action = @('ses:SendEmail', 'ses:SendRawEmail'); Resource = '*' } }
  # Cognito (contraseñas): solo las acciones de administrador que usa src/lib/idp.js, sobre ese grupo de usuarios.
  $pool = $vars['COGNITO_USER_POOL_ID']
  if ($pool) {
    $poolRegion = $pool.Split('_')[0]
    $permisos += @{ Effect = 'Allow'; Resource = "arn:aws:cognito-idp:${poolRegion}:${cuenta}:userpool/$pool"; Action = @(
      'cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminInitiateAuth', 'cognito-idp:AdminEnableUser',
      'cognito-idp:AdminDisableUser', 'cognito-idp:AdminDeleteUser', 'cognito-idp:AdminUpdateUserAttributes', 'cognito-idp:ListUsers') }
  } else { Write-Host 'Aviso: falta COGNITO_USER_POOL_ID en .env (ejecuta scripts\crear-cognito.ps1): nadie podrá iniciar sesión.' -ForegroundColor Yellow }
  if ($permisos.Count) {
    aws iam put-role-policy --role-name $rol --policy-name acceso-novatech --policy-document (Json 'permisos.json' @{ Version = '2012-10-17'; Statement = $permisos })
    Revisar 'dar permisos al rol (bucket, Cognito)'
  }

  # ---------- 3) Función ----------
  Paso 'Función Lambda'
  $actual = aws lambda get-function-configuration --function-name $Funcion --region $Region --query 'Environment.Variables' --output json 2>$null
  $existe = $LASTEXITCODE -eq 0
  $previas = if ($existe -and $actual) { ($actual -join "`n") | ConvertFrom-Json } else { $null }
  # Se conservan entre despliegues: la clave de las sesiones y la dirección del frontend.
  $vars['JWT_SECRET'] = if ($previas.JWT_SECRET) { $previas.JWT_SECRET } else { $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).Replace('+', '-').Replace('/', '_').TrimEnd('=') }
  $front = if ($Frontend) { $Frontend } elseif ($previas.FRONTEND_URL) { $previas.FRONTEND_URL } else { 'http://localhost:3000' }
  $vars['FRONTEND_ORIGINS'] = if ($Frontend -or -not $previas.FRONTEND_ORIGINS) { $front } else { $previas.FRONTEND_ORIGINS }
  $vars['FRONTEND_URL'] = $front
  $entorno = Json 'entorno.json' @{ Variables = $vars }
  Write-Host ("Variables: " + (($vars.Keys | Sort-Object) -join ', '))

  if (-not $existe) {
    # Un rol recién creado tarda unos segundos en poder usarse: se reintenta.
    for ($i = 1; $i -le 8; $i++) {
      aws lambda create-function --function-name $Funcion --region $Region --package-type Image --code "ImageUri=$imagen" --role $rolArn `
        --timeout $Tiempo --memory-size $Memoria --architectures x86_64 --environment $entorno --description 'API de NovaTech' --query 'FunctionArn' --output text 2>$null
      if ($LASTEXITCODE -eq 0) { break }
      if ($i -eq 8) { aws lambda create-function --function-name $Funcion --region $Region --package-type Image --code "ImageUri=$imagen" --role $rolArn --timeout $Tiempo --memory-size $Memoria --architectures x86_64 --environment $entorno --query 'FunctionArn' --output text; Revisar 'crear la función' }
      Write-Host "  esperando a que el rol esté disponible ($i)…"; Start-Sleep 6
    }
  } else {
    aws lambda update-function-code --function-name $Funcion --region $Region --image-uri $imagen --query 'LastUpdateStatus' --output text
    Revisar 'actualizar el código'
    aws lambda wait function-updated-v2 --function-name $Funcion --region $Region
    aws lambda update-function-configuration --function-name $Funcion --region $Region --timeout $Tiempo --memory-size $Memoria --environment $entorno --query 'LastUpdateStatus' --output text
    Revisar 'actualizar la configuración'
  }
  aws lambda wait function-active-v2 --function-name $Funcion --region $Region
  aws lambda wait function-updated-v2 --function-name $Funcion --region $Region
  Revisar 'esperar a que la función quede lista'

  # ---------- 5) Dirección pública ----------
  Paso 'Dirección pública (Function URL)'
  $url = aws lambda get-function-url-config --function-name $Funcion --region $Region --query 'FunctionUrl' --output text 2>$null
  if ($LASTEXITCODE -ne 0) {
    # El CORS lo maneja el propio backend (src/lambda.js, con FRONTEND_ORIGINS): aquí no se configura.
    $url = aws lambda create-function-url-config --function-name $Funcion --region $Region --auth-type NONE --query 'FunctionUrl' --output text
    Revisar 'crear la dirección pública'
  }
  # Permiso para que cualquiera pueda llamar a la dirección (si ya existen, AWS avisa y se sigue).
  aws lambda add-permission --function-name $Funcion --region $Region --statement-id url-publica --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE --query 'Statement' --output text 2>$null | Out-Null
  aws lambda add-permission --function-name $Funcion --region $Region --statement-id url-publica-invocar --action lambda:InvokeFunction --principal '*' --invoked-via-function-url --query 'Statement' --output text 2>$null | Out-Null
  $url = $url.TrimEnd('/')

  Paso 'Prueba'
  $bien = $false
  for ($i = 1; $i -le 4 -and -not $bien; $i++) {
    try { $h = Invoke-RestMethod "$url/health" -TimeoutSec 40; Write-Host "/health → $($h.status), base de datos: $($h.db)"; $bien = $h.status -eq 'ok' }
    catch { Write-Host "  intento ${i}: $($_.Exception.Message)"; Start-Sleep 5 }
  }
  if ($bien) {
    Write-Host "`nListo. Dirección del backend:" -ForegroundColor Green
    Write-Host "  $url"
    Write-Host "Frontend autorizado: $($vars['FRONTEND_ORIGINS'])"
    if ($vars['FRONTEND_ORIGINS'] -eq 'http://localhost:3000') { Write-Host 'Cuando tengas la dirección de Amplify, vuelve a ejecutar con  -Frontend https://…' -ForegroundColor Yellow }
  } else {
    Write-Host "`nLa función quedó creada en $url pero /health no respondió bien." -ForegroundColor Yellow
    Write-Host 'Revisa en MongoDB Atlas: Network Access → permitir acceso desde cualquier IP (0.0.0.0/0).'
    Write-Host "Registros:  aws logs tail /aws/lambda/$Funcion --region $Region --since 10m"
    exit 1
  }
}
finally { Remove-Item -Recurse -Force $tmp -Confirm:$false -ErrorAction SilentlyContinue }
