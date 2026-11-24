# Crea el grupo de usuarios de Amazon Cognito donde viven las contraseñas de NovaTech y guarda sus
# datos en backend\.env (COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION). Si ya existe, solo
# completa el .env. Después: scripts\desplegar-lambda.ps1 (da al backend permiso sobre el grupo).
#
# Configuración:
# - Plan Lite: gratis hasta 10 000 usuarios activos al mes; NovaTech solo usa las APIs de administrador.
# - Solo el backend crea cuentas (nadie se registra directo en Cognito) y Cognito no envía correos:
#   los códigos y avisos los sigue enviando el backend con sus plantillas.
# - Contraseñas de 8 a 64 caracteres, igual que en validate.js (sin exigir mayúsculas ni símbolos).
# - Protección contra borrado activada: el grupo no se puede eliminar por error.
#
# Requisitos: la CLI de AWS con credenciales (aws configure). Uso, desde la carpeta backend:
#   powershell -ExecutionPolicy Bypass -File scripts\crear-cognito.ps1
param(
  [string]$Region = 'us-east-1',
  [string]$Nombre = 'novatech-usuarios',
  [string]$Cliente = 'novatech-backend'
)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Paso($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Revisar($t) { if ($LASTEXITCODE -ne 0) { throw "Falló: $t" } }
$tmp = Join-Path $env:TEMP ("novatech-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
function Json($nombre, $obj) { $f = Join-Path $tmp $nombre; [IO.File]::WriteAllText($f, ($obj | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding $false)); "file://$f" }

try {
  if (-not (Test-Path .env)) { throw 'No existe backend\.env' }
  Paso 'Cuenta de AWS'
  $cuenta = aws sts get-caller-identity --query Account --output text
  if ($LASTEXITCODE -ne 0 -or -not $cuenta) { throw 'La CLI de AWS no tiene credenciales. Ejecuta: aws configure' }
  Write-Host "Cuenta $cuenta · región $Region"

  Paso "Grupo de usuarios «$Nombre»"
  $pool = aws cognito-idp list-user-pools --max-results 60 --region $Region --query "UserPools[?Name=='$Nombre'].Id | [0]" --output text
  Revisar 'consultar los grupos de usuarios'
  if ($pool -and $pool -ne 'None') { Write-Host "Ya existe: $pool" } else {
    $config = @{
      PoolName = $Nombre
      Policies = @{ PasswordPolicy = @{ MinimumLength = 8; RequireUppercase = $false; RequireLowercase = $false; RequireNumbers = $false; RequireSymbols = $false; TemporaryPasswordValidityDays = 7 } }
      AdminCreateUserConfig = @{ AllowAdminCreateUserOnly = $true }
      UsernameConfiguration = @{ CaseSensitive = $false }
      AccountRecoverySetting = @{ RecoveryMechanisms = @(@{ Priority = 1; Name = 'admin_only' }) }
      DeletionProtection = 'ACTIVE'
      UserPoolTags = @{ proyecto = 'novatech' }
    }
    $pool = aws cognito-idp create-user-pool --region $Region --cli-input-json (Json 'pool.json' ($config + @{ UserPoolTier = 'LITE' })) --query 'UserPool.Id' --output text 2>$null
    if ($LASTEXITCODE -ne 0) {
      # CLI antigua sin el parámetro de plan: se crea con el plan por defecto (también gratis hasta 10 000 usuarios).
      $pool = aws cognito-idp create-user-pool --region $Region --cli-input-json (Json 'pool2.json' $config) --query 'UserPool.Id' --output text
      Revisar 'crear el grupo de usuarios'
    }
    Write-Host "Creado: $pool"
  }

  Paso "Cliente de aplicación «$Cliente»"
  $client = aws cognito-idp list-user-pool-clients --user-pool-id $pool --region $Region --query "UserPoolClients[?ClientName=='$Cliente'].ClientId | [0]" --output text
  Revisar 'consultar los clientes de aplicación'
  if ($client -and $client -ne 'None') { Write-Host "Ya existe: $client" } else {
    $client = aws cognito-idp create-user-pool-client --region $Region --user-pool-id $pool --client-name $Cliente --no-generate-secret `
      --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH --prevent-user-existence-errors ENABLED `
      --query 'UserPoolClient.ClientId' --output text
    Revisar 'crear el cliente de aplicación'
    Write-Host "Creado: $client"
  }

  Paso 'Guardar en backend\.env'
  # Se reemplazan o agregan solo estas tres líneas; el resto del .env no se toca ni se muestra.
  $nuevas = [ordered]@{ COGNITO_USER_POOL_ID = $pool; COGNITO_CLIENT_ID = $client; COGNITO_REGION = $Region }
  $lineas = [Collections.Generic.List[string]]([IO.File]::ReadAllLines((Resolve-Path .env), [Text.Encoding]::UTF8))
  foreach ($k in $nuevas.Keys) {
    $i = -1; for ($j = 0; $j -lt $lineas.Count; $j++) { if ($lineas[$j] -match "^\s*$k\s*=") { $i = $j } }
    if ($i -ge 0) { $lineas[$i] = "$k=$($nuevas[$k])" } else { $lineas.Add("$k=$($nuevas[$k])") }
  }
  [IO.File]::WriteAllLines((Resolve-Path .env), $lineas, (New-Object Text.UTF8Encoding $false))
  Write-Host 'Listo: COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID y COGNITO_REGION quedaron en .env.' -ForegroundColor Green
  Write-Host 'Siguiente paso: powershell -ExecutionPolicy Bypass -File scripts\desplegar-lambda.ps1'
}
finally { Remove-Item -Recurse -Force $tmp -Confirm:$false -ErrorAction SilentlyContinue }
