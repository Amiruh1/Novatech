# Novatech

## Ayudas de accesibilidad

La tienda incluye dos ayudas opcionales que se pueden combinar:

- **Texto y contraste:** texto ampliado, mayor contraste y menos movimiento, orientado a personas con baja visión.
- **Controles amplios y navegación:** botones más grandes, foco visible y accesos al buscador, productos y carrito, orientado a personas con dificultad para usar el ratón.

El asistente aparece al abrir o recargar la página. No vuelve a interrumpir al navegar entre secciones. Pregunta qué ayudas se prefieren, sin solicitar información sobre una discapacidad.

| Tecla | Acción |
| --- | --- |
| F, dentro del asistente | Escuchar la guía en español |
| N, dentro del asistente | Cerrar el asistente y conversar por voz con Nova |
| Alt + N, en la tienda | Abrir Nova y empezar o terminar la conversación por voz |
| K o Escape, dentro del asistente | Cerrar el aviso y desactivar la voz, conservando las ayudas ya guardadas |
| Tab / Shift + Tab | Avanzar / retroceder entre controles |
| ↓ o → / ↑ o ← | Siguiente / anterior en el asistente y en el catálogo; en otras páginas, con Controles amplios y navegación activo |
| Enter | Activar botones y enlaces |
| Espacio | Marcar o desmarcar opciones |
| Flechas, en las direcciones de envío | Cambiar la dirección seleccionada |

Seleccionar las ayudas y pulsar **Aplicar y continuar** las guarda en este navegador. **Accesibilidad**, en la cabecera, vuelve a abrir el panel. **Restaurar vista habitual** desactiva ambos perfiles. F y K solo funcionan dentro del asistente; no interceptan letras al buscar o escribir en formularios.

Las flechas desplazan el foco, sin activar botones ni marcar opciones. En campos de texto, selectores, rangos y grupos de radio mantienen su comportamiento habitual; Tab permite salir de esos controles.

Las rutas `/accesibilidad/lectura` y `/accesibilidad/navegacion` activan la ayuda correspondiente y llevan a `/tienda`. Ambas usan los mismos productos, cuenta y carrito; no hay una tienda duplicada.

La lectura por voz se reproduce únicamente al solicitarla: F, **Escuchar guía**, **Escuchar ayuda de esta página** o **Escuchar producto**. **Detener lectura** la detiene y también se cancela al cambiar de página. Usa `speechSynthesis` del navegador; la voz concreta depende del sistema. Si no está disponible, se muestra un mensaje y la guía escrita sigue funcionando. No se leen contraseñas ni datos de pago.

Se priorizan voces en español de Perú, México y Latinoamérica. Se espera brevemente a que el navegador cargue las voces y se muestra el nombre elegido. Si solo hay otra variante de español, se avisa; no se instala ni descarga una voz adicional.

### Narrar controles al navegar

Ayuda opcional que dice el nombre, el tipo y el estado del control que recibe el foco, por ejemplo «Agregar Monitor 27 QHD al carrito, botón» o «Texto y contraste, casilla marcada». Complementa los perfiles anteriores; no reemplaza a un lector de pantalla.

- **Activar:** botón **Activar narrador** en el asistente o en la barra **Tus ayudas**. Se confirma una sola vez con «Narrador activado».
- **Silenciar:** el mismo botón pasa a **Silenciar narrador** y corta toda la voz al instante, sin decir nada. También está dentro de las ventanas de la tienda (comparador, carrito, cuenta, direcciones, producto agregado, vista ampliada y confirmaciones). **Detener lectura** solo detiene una lectura de guía o producto; el narrador sigue activo.
- **Al recargar:** la preferencia se recuerda, pero el narrador no habla hasta pulsar **Reactivar narrador**. K, Escape, la X o **Continuar sin asistente** cierran el asistente sin voz. **Restaurar vista habitual** también lo apaga.
- **Dónde funciona:** `/tienda`, `/producto/:id`, `/carrito` y `/checkout`, su cabecera y sus ventanas, y el propio asistente desde cualquier página. Al ir a otra página se desactiva y hay que reactivarlo al volver. Mientras está abierta la paleta Ctrl + K no narra nada.
- **Cuándo habla:** con Tab, Shift + Tab, las flechas habilitadas y los cambios de estado del control enfocado (casillas, filtros, favoritos, Mostrar contraseña, opciones de un selector). Una lectura manual en curso tiene prioridad. No habla al pasar el ratón, al aparecer un aviso ni con la pestaña oculta.
- **Privacidad:** nunca lee lo escrito en un campo, contraseñas, códigos ni datos de pago. Las direcciones guardadas se anuncian como «Dirección guardada 1, 2…», sin alias ni datos personales. Los textos no se guardan ni se envían a ningún servicio de la tienda; la voz la genera el navegador, que puede usar voces locales o del sistema en línea.

Si el navegador no permite iniciar la voz, el narrador se apaga y muestra «Reactivar narrador»; no reintenta en cada movimiento.

### Nova, asistente de la tienda

El botón **Hablar con Nova** aparece en `/tienda`, `/producto/:id`, `/carrito` y `/checkout`. Abre un panel lateral donde se escriben preguntas sobre la tienda y el catálogo, por ejemplo «monitor de menos de 1500 soles», «¿cuál de esos cuesta menos?» o «¿cómo pago mi pedido?».

- **Respuestas:** las dudas de uso salen de guías verificadas con el flujo real de la tienda. Los productos, precios y stock salen siempre del catálogo; Nova no inventa precios, envíos ni políticas y, si no tiene un dato, lo dice.
- **IA:** con `OPENAI_API_KEY` en `backend/.env`, el backend usa OpenAI solo para entender preguntas libres y explicar conceptos generales de tecnología. El servidor valida categorías, marcas y temas antes de consultar el catálogo. Sin clave, o si OpenAI falla o tarda más de 12 segundos, Nova responde con sus reglas propias.
- **Botones:** las respuestas pueden ofrecer acciones como Ver carrito, Abrir accesibilidad o Ir al buscador. Nova no compra, no vacía el carrito ni modifica datos.
- **Botones:** el botón **+** abre preguntas rápidas y accesos directos, y después de cada respuesta aparecen preguntas de seguimiento; basta tocarlas para enviarlas.
- **Conversación por voz:** **Hablar**, la tecla **N** del asistente de accesibilidad o **Alt + N** inician una conversación sin manos, pensada también para personas ciegas: Nova saluda, suena un tono cuando es tu turno y responde con una voz algo más rápida. Nova envía la pregunta cuando dejas de hablar 3 segundos, responde en voz alta con el micrófono cerrado y vuelve a escucharte. Decir «terminar» o «adiós», pulsar **Terminar** o **Alt + N** la cierra, y decir «repite» vuelve a leer la última respuesta; también se cierra al cerrar el panel, al ocultar la pestaña o tras unos 20 segundos sin oír nada. Funciona en navegadores con reconocimiento de voz, como Chrome o Edge, que procesan el audio con sus propios servicios. Mientras dura, el narrador se pausa.
- **Privacidad:** antes de enviar una pregunta a OpenAI se ocultan correos y números largos. La conversación vive solo en la pestaña: **Borrar conversación** la elimina y no se guarda en la base de datos.
- **Límites:** preguntas de hasta 1000 caracteres y 20 preguntas por minuto por equipo.

Configuración en `backend/.env` (ver `.env.ejemplo`): `OPENAI_API_KEY` y, opcionalmente, `OPENAI_MODEL` (por defecto `gpt-4.1-mini`). Después de cambiarlos, reiniciar el backend. Conviene fijar un límite de gasto mensual en la cuenta de OpenAI.

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

### Inicio de sesión con Google

El mismo Client ID de OAuth debe estar en `frontend/src/app/core/config/api.config.ts` (`GOOGLE_CLIENT_ID`) y en `backend/.env` (`GOOGLE_CLIENT_ID=...`, ver `.env.ejemplo`). En Google Cloud Console, ese cliente web debe tener como **Orígenes autorizados de JavaScript** la dirección exacta desde la que se abre la web, por ejemplo `http://localhost:4200` y `http://127.0.0.1:4200`; si falta, Google muestra `Error 400: origin_mismatch`. Tras cambiar `backend/.env`, reiniciar el backend.

Para generar la versión de producción:

```powershell
npm run build
```
