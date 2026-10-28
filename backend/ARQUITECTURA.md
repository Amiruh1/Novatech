# Capas del backend

NovaTech organiza el backend en tres capas. Se mantienen los nombres de carpetas del proyecto para que sea fácil encontrar cada parte.

| Capa | Carpetas | Responsabilidad |
| --- | --- | --- |
| Application | `src/routes`, `src/controllers`, `src/middlewares` | Recibir peticiones HTTP, validar su formato, comprobar permisos y devolver respuestas. |
| Business | `src/services` | Ejecutar los casos de uso: autenticación, contraseñas, reglas de pago, cambios de estado, preferencias y movimientos de stock. |
| Access data | `src/repositories` | Consultar y modificar MySQL; construir consultas y acceder al almacenamiento de imágenes en S3. |

El flujo es `ruta → controller → service → repository`. Los controllers y servicios no importan el pool de MySQL ni ejecutan SQL. Cada repositorio expone operaciones concretas, como buscar un usuario, registrar una venta o actualizar existencias. Los valores se envían como parámetros; los campos y órdenes de las consultas dinámicas usan opciones conocidas.

Por ejemplo, un ajuste de inventario entra por `products.controller.ts`. El servicio calcula la diferencia y prepara el movimiento; `products.repository.ts` consulta y guarda los datos. En autenticación, el servicio comprueba bcrypt y genera los hashes; el repositorio solamente los persiste. Las imágenes siguen el mismo recorrido mediante los módulos `media` y se almacenan en S3.

## Transacciones

El registro principal de una venta usa `sp_registrar_venta`, definido en `sql/novatech_erp_full.sql`. Ese procedimiento contiene la transacción, el bloqueo de existencias y el rollback ante un error. El repositorio es el único punto desde el backend que lo invoca.

El alcance transaccional existente se conserva: el coste de envío, los metadatos de pago, los movimientos adicionales y los cambios posteriores de estado se guardan en operaciones separadas. Un ajuste manual de stock también conserva sus operaciones separadas. Si se necesita atomicidad de todo ese flujo, debe ampliarse expresamente la transacción; tener tres capas por sí solo no la proporciona.

Los scripts de instalación y migración son herramientas operativas, fuera del flujo HTTP. La conexión se configura en `src/config/db.ts`; las credenciales de producción se entregan desde AWS Secrets Manager al desplegar y no deben incluirse en el repositorio.

## Comprobación

Desde `backend`:

```powershell
npm run build
node --test tests/layers.test.cjs
```

Las pruebas cubren autenticación, recuperación de contraseña, enlaces de activación, filtros del catálogo, creación de productos, ajustes de stock, registro de ventas, pagos y cambios de estado. Sustituyen la conexión de MySQL por un doble de prueba: no modifican la base de datos ni reemplazan las pruebas de integración del despliegue. También comprueban que las capas application y business no vuelvan a acceder directamente al pool.
