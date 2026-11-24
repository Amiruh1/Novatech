# Publicar NovaTech en AWS

El frontend va en **Amplify** (archivos estáticos) y el backend en **Lambda** con una dirección https
(Function URL). La base de datos sigue en MongoDB Atlas y las imágenes en S3.

Orden: 1) backend → 2) frontend → 3) decirle al backend cuál es la dirección del frontend.

## 0. Antes de empezar

- **MongoDB Atlas:** en **Network Access → Add IP Address**, elige **Allow access from anywhere**
  (`0.0.0.0/0`). Lambda no tiene una IP fija. La base queda protegida por el usuario y la contraseña
  del `MONGODB_URI`, así que esa contraseña debe ser larga y aleatoria.
- Docker Desktop encendido y la CLI de AWS con credenciales (`aws configure`).

## 0.5 Cognito (contraseñas), una sola vez

Las contraseñas viven en **Amazon Cognito**: MongoDB no guarda ningún hash. Desde la carpeta `backend`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\crear-cognito.ps1
```

Crea el grupo de usuarios `novatech-usuarios` (plan Lite, gratis hasta 10 000 usuarios activos al mes) y
su cliente de aplicación, y escribe `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` y `COGNITO_REGION` en `.env`.
El paso 1 le da a la función permiso solo sobre ese grupo.

- Las cuentas que ya existían se pasan a Cognito solas la primera vez que inician sesión (o cambian o
  recuperan su contraseña), y su hash se borra de la base.
- Para el backend en tu PC, el usuario de IAM de `AWS_ACCESS_KEY_ID` necesita las mismas acciones
  `cognito-idp:Admin*` y `ListUsers` sobre el grupo.
- Para cargar los datos de ejemplo (`npm run seed`) Cognito ya debe estar configurado.

## 1. Backend en Lambda

Desde la carpeta `backend`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\desplegar-lambda.ps1
```

El script hace todo: construye la imagen (`Dockerfile.lambda`), la sube a ECR, crea el rol y la función
`novatech-backend`, carga las variables desde `backend\.env`, abre la dirección pública y la prueba.
Al final imprime la dirección, parecida a `https://abc123.lambda-url.us-east-1.on.aws`.

Sobre las variables:

- Se copian de tu `.env` tal cual, sin mostrarse en pantalla. El `.env` no entra en la imagen.
- `JWT_SECRET` se genera nuevo la primera vez (distinto al de tu PC) y se conserva en los siguientes despliegues.
- `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` **no** se cargan: la función usa su propio rol, que solo
  tiene permiso sobre el bucket de imágenes.
- `MAIL_MODE` debe ser `smtp` o `ses`, nunca `console`.

## 2. Frontend en Amplify

1. En la carpeta `frontend`, con la dirección del paso 1:
   ```powershell
   powershell -ExecutionPolicy Bypass -File empaquetar.ps1 -Api https://abc123.lambda-url.us-east-1.on.aws
   ```
   Compila y crea `novatech-web.zip`. No cambia `.env.local`, así que en tu PC sigues trabajando contra
   el backend local.
2. Consola de AWS: **Amplify → Create new app → Deploy without Git**, arrastra `novatech-web.zip`
   y pulsa **Save and deploy**.

## 3. Conectar los dos

1. Vuelve a ejecutar el script con la dirección que dio Amplify (sin `/` final):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\desplegar-lambda.ps1 -Frontend https://main.d1abcd.amplifyapp.com
   ```
   Con eso el backend acepta las llamadas de la web y los enlaces de los correos apuntan a ella.
2. En el bucket de S3 (**Permissions → CORS**), agrega esa misma dirección a `AllowedOrigins`
   para que el administrador pueda subir imágenes de productos.
3. Si usan el botón de Google, agrega la dirección en los orígenes autorizados del cliente de Google.

## Actualizar después

- **Backend** (código o variables de `.env`): vuelve a ejecutar `scripts\desplegar-lambda.ps1`.
- **Frontend:** repite el paso 2.1 y en Amplify usa **Deploy updates** con el zip nuevo.

## Cosas que conviene saber

- **Costo:** Lambda cobra por uso; con poco tráfico entra en la capa gratuita. ECR cobra unos centavos
  al mes por guardar las imágenes: se pueden borrar las antiguas desde la consola.
- **Primera visita lenta:** tras unos minutos sin uso, la primera petición tarda 2 a 4 segundos
  (la función «despierta» y se conecta a la base). Las siguientes son rápidas.
- **Límites de peticiones:** se cuentan por cada copia de la función (ver `src/lambda.js`). Para poner
  un tope al gasto ante un abuso, fija la *concurrencia reservada* de la función en la consola.
- **Registros:** `aws logs tail /aws/lambda/novatech-backend --region us-east-1 --since 10m`
- **Otra opción (cuenta con plan de pago):** el `Dockerfile` normal y `scripts\subir-imagen.ps1` sirven
  para App Runner o ECS, que ejecutan el servidor Express (`src/server.js`).
