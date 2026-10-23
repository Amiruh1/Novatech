# Novatech

## Ayudas de accesibilidad

La tienda incluye dos ayudas opcionales que se pueden combinar:

- **Texto y contraste:** texto ampliado, mayor contraste y menos movimiento, orientado a personas con baja visión.
- **Controles amplios y navegación:** botones más grandes, foco visible y accesos al buscador, productos y carrito, orientado a personas con dificultad para usar el ratón.

El asistente aparece al abrir o recargar la página. No vuelve a interrumpir al navegar entre secciones. Pregunta qué ayudas se prefieren, sin solicitar información sobre una discapacidad.

| Tecla | Acción |
| --- | --- |
| F, dentro del asistente | Escuchar la guía en español |
| K o Escape, dentro del asistente | Cerrar el aviso y desactivar la voz, conservando las ayudas ya guardadas |
| Tab / Shift + Tab | Avanzar / retroceder entre controles |
| ↓ o → / ↑ o ← | Siguiente / anterior en el asistente y en el catálogo; en otras páginas, con Controles amplios y navegación activo |
| Enter | Activar botones y enlaces |
| Espacio | Marcar o desmarcar opciones |
| Flechas, en las direcciones de envío | Cambiar la dirección seleccionada |

Seleccionar las ayudas y pulsar **Aplicar y continuar** las guarda en este navegador. **Accesibilidad**, en la cabecera, vuelve a abrir el panel. **Restaurar vista habitual** desactiva ambos perfiles. F y K solo funcionan dentro del asistente; no interceptan letras al buscar o escribir en formularios.

Las flechas desplazan el foco, sin activar botones ni marcar opciones. En campos de texto, selectores, rangos y grupos de radio mantienen su comportamiento habitual; Tab permite salir de esos controles.

Las rutas `/accesibilidad/lectura` y `/accesibilidad/navegacion` activan la ayuda correspondiente y llevan a `/tienda`. Ambas usan los mismos productos, cuenta y carrito; no hay una tienda duplicada.

La voz se reproduce únicamente al solicitarla: F, **Escuchar guía**, **Escuchar ayuda de esta página** o **Escuchar producto**. Se puede detener y se cancela al cambiar de página. Usa `speechSynthesis` del navegador; la voz concreta depende del sistema. Si no está disponible, se muestra un mensaje y la guía escrita sigue funcionando. No se leen contraseñas ni datos de pago.

Se priorizan voces en español de Perú, México y Latinoamérica. Se espera brevemente a que el navegador cargue las voces y se muestra el nombre elegido. Si solo hay otra variante de español, se avisa; no se instala ni descarga una voz adicional.

## Ejecutar la web

Primero abre Docker Desktop y arranca el contenedor existente de MySQL:

```powershell
docker start novatech-mysql
```

En una terminal, desde `backend`:

```powershell
npm ci
npm run dev:local
```

En otra terminal, desde `frontend`:

```powershell
npm ci
npm start
```

Abrir `http://localhost:4200` o `http://127.0.0.1:4200`. Angular envía las peticiones `/api` al backend de Novatech en el puerto **3001**, para evitar interferencias con otros proyectos en el puerto 3000. La base de datos configurada en el backend también debe estar disponible. En producción, el servidor debe dirigir `/api` al backend.

Para generar la versión de producción:

```powershell
npm run build
```
