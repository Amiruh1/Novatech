# Arranque en AWS

La imagen usa Node 22 y ejecuta el backend como usuario `node`. `/health` comprueba el proceso; `/ready` comprueba también la conexión y la tabla de productos. La conexión RDS utiliza `DB_SSL=rds` para cifrar y verificar el certificado.

El despliegue obtiene la configuración desde Secrets Manager. `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` y las variables SMTP se pasan al contenedor. `FRONTEND_URL` es una sola URL para los enlaces del correo; `CORS_ORIGINS` admite varios orígenes separados por coma. SMTP requiere TLS y un certificado válido.

Antes de iniciar la API se ejecuta, dentro de la misma imagen:

```sh
node dist/src/scripts/bootstrap-production.js
```

Necesita `NODE_ENV=production`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD`. La clave debe tener al menos 20 caracteres y no superar 72 bytes. Estas dos variables se entregan solo al contenedor de bootstrap. El script completa `categorias.imagen` y la tabla `banners` si faltan, desactiva únicamente las cuentas demo que mantienen el hash original y crea el administrador si ese correo no existe. Repetirlo conserva las contraseñas y los datos actuales. Si el correo ya pertenece a una cuenta que no es un administrador activo, termina con error.

El SQL completo se importa únicamente en una base vacía: contiene instrucciones para recrear tablas. No se debe ejecutar sobre una base con datos.

# Imágenes

Configurar `MEDIA_BUCKET`, `AWS_REGION` y `MEDIA_BASE_URL`. El bucket es privado y el rol de EC2 necesita `s3:PutObject` y `s3:GetObject` sobre `images/*`, sin access keys en el código. Actualmente la URL base es `https://novatech.apicesarmeza.lat/api/media`; puede sustituirse por una distribución CloudFront cuando esté disponible.

El administrador puede subir JPEG, PNG o WebP de hasta 5 MB desde productos, categorías y banners. `POST /api/media/images` valida JWT, rol, tamaño y firma del archivo. `GET` y `HEAD /api/media/images/:filename` sirven imágenes públicas desde S3, con caché y cabeceras compatibles con el frontend de Amplify. Solo se admiten los nombres generados por la aplicación; el bucket permanece privado.

La migración inicial se ejecuta en el servidor con las mismas variables de la API:

```sh
node dist/src/scripts/migrate-media.js --dry-run
node dist/src/scripts/migrate-media.js --apply
```

Solo descarga desde `picsum.photos`, `fastly.picsum.photos` e `images.unsplash.com`, comprobando también cada redirección, el límite de tamaño y el tipo real. Incluye los productos y banners existentes y el fallback que la tienda ya usa para categorías con imagen nula. Actualiza cada URL después de subirla correctamente y solo si sigue igual en la base. Si falla la descarga o la subida, conserva la imagen anterior. Las claves dependen del contenido y las URL ya migradas se omiten en ejecuciones posteriores.

# Verificación local

```sh
npm ci
npm run build
node --test tests/layers.test.cjs
node scripts/test-media.cjs
node scripts/test-media-migration.cjs
node scripts/test-bootstrap-production.cjs
npm audit --omit=dev --audit-level=high
docker build -t novatech-deploy-check:local .
```

La prueba de bootstrap requiere Docker y `mysql:8.4`. Crea y elimina su propio contenedor, carga el SQL completo y comprueba arranque, cuentas, catálogo y migración de imágenes. No usa la base local, no escribe en AWS y no envía correos.
