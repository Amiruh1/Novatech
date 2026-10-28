# Capas del backend

NovaTech organiza el backend en tres carpetas que corresponden a las capas solicitadas:

```text
src/
  application/   Rutas, controllers, permisos HTTP y presentación de documentos
  business/      Casos de uso, reglas, servicios y plantillas de notificaciones
  access-data/   Repositorios, conexión MySQL y adaptadores de servicios externos
```

| Capa | Carpetas | Responsabilidad |
| --- | --- | --- |
| Application | `src/application` | Recibir peticiones HTTP, validar su formato, comprobar permisos y devolver respuestas. |
| Business | `src/business` | Ejecutar los casos de uso: autenticación, contraseñas, reglas de pago, cambios de estado, preferencias y movimientos de stock. |
| Access data | `src/access-data` | Consultar y modificar MySQL, almacenar imágenes en S3 y comunicarse con SMTP, Google y OpenAI. |

El flujo es **Application → Business → Access data**: `ruta → controller → service → repository/adaptador`. Application no llama directamente a los repositorios; Business no conoce Express ni ejecuta SQL o peticiones HTTP externas; Access data no importa las capas superiores. Cada repositorio expone operaciones concretas, como buscar un usuario, registrar una venta o actualizar existencias. Los valores SQL se envían como parámetros; los campos y órdenes de las consultas dinámicas usan opciones conocidas.

Por ejemplo, un ajuste de inventario entra por `application/controllers/products.controller.ts`. El servicio de Business calcula la diferencia y prepara el movimiento; `access-data/repositories/products.repository.ts` consulta y guarda los datos. En autenticación, el servicio comprueba bcrypt y genera los hashes; el repositorio solamente los persiste. Las imágenes y la comprobación `/ready` siguen el mismo recorrido. Las instrucciones de Nova se preparan en Business y su adaptador de Access data realiza la petición a OpenAI.

## Transacciones

El registro principal de una venta usa `sp_registrar_venta`, definido en `sql/novatech_erp_full.sql`. Ese procedimiento contiene la transacción, el bloqueo de existencias y el rollback ante un error. El repositorio es el único punto desde el backend que lo invoca.

El alcance transaccional existente se conserva: el coste de envío, los metadatos de pago, los movimientos adicionales y los cambios posteriores de estado se guardan en operaciones separadas. Un ajuste manual de stock también conserva sus operaciones separadas. Si se necesita atomicidad de todo ese flujo, debe ampliarse expresamente la transacción; tener tres capas por sí solo no la proporciona.

`src/scripts` contiene las herramientas operativas de instalación y migración, fuera del flujo HTTP. Conservan sus rutas para que el despliegue existente pueda ejecutarlas. La conexión se configura en `src/access-data/config/db.ts`; las credenciales de producción se entregan desde AWS Secrets Manager al desplegar y no deben incluirse en el repositorio.

## Comprobación

Desde `backend`:

```powershell
npm run build
node --test tests/layers.test.cjs tests/external-gateways.test.cjs tests/notification-google.test.cjs
```

Las pruebas cubren autenticación, recuperación de contraseña, enlaces de activación, filtros del catálogo, creación de productos, ajustes de stock, registro de ventas, pagos, cambios de estado y disponibilidad. Sustituyen la conexión de MySQL por un doble de prueba: no modifican la base de datos ni reemplazan las pruebas de integración del despliegue. También recorren las tres carpetas para impedir dependencias en sentido contrario, consultas desde las capas superiores o conexiones externas fuera de Access data.
