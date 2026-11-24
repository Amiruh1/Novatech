// Guías de uso de Nova: redactadas a partir del flujo real de la tienda (checkout, pagos, envíos,
// comprobantes, cuenta, accesibilidad…). Si un tema no está aquí, Nova dice que no tiene ese dato: no inventa políticas.
// El orden importa: se revisan de arriba abajo y gana la primera que coincide (las más específicas primero).
import { SHIPPING_ZONES } from '../shipping.js';

const soles = (n) => `S/ ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const free = () => Number(process.env.FREE_SHIPPING_FROM ?? 500);

export const GUIDES = {
  ayuda: {
    rx: /^(ayuda|help|menu|opciones|info|informacion)$|que (puedes|sabes) hacer|quien eres|que eres|para que sirves|como funcionas|en que me (puedes )?ayudar|como te uso|que me puedes decir/,
    texto: () => `Soy Nova, la asistente de NovaTech. Puedo:
• Buscar productos por categoría, marca o precio: «monitores de menos de 1500 soles», «laptops Lenovo».
• Comparar los que te mostré: «¿cuál de esos cuesta menos?», «¿cuáles tienen stock?».
• Agregar al carrito: «agrega el primero», «agrega 2 mouse Logitech».
• Llevarte a una página: «ver carrito», «ir a ofertas», «mis pedidos», «pagar».
• Explicarte pagos, envíos, comprobantes, garantía, tu cuenta y la accesibilidad.
Con la tecla J me hablas por voz en cualquier página.`,
    acciones: [{ label: 'Ver ofertas', href: '/ofertas/' }],
    sugerencias: ['¿Qué categorías tienen?', '¿Qué productos están en oferta?', '¿Cómo pago mi pedido?'],
  },
  seguridad: {
    rx: /\b(seguro|segura|seguridad|privacidad|confiable|estafa|fraude)\b|datos de (mi )?tarjeta|guardan (mi |la )?tarjeta|mis datos (estan|son)|protegen mis datos/,
    texto: () => `Tu compra es segura:
• El número completo de tu tarjeta y el CVV nunca se envían ni se guardan: solo el titular, la marca y los últimos 4 dígitos.
• Tu contraseña la protege Amazon Cognito: NovaTech no la guarda en su base de datos.
• Todo el sitio usa conexión cifrada (https) y tu sesión se cierra sola después de 8 horas.
• Al registrarte verificamos tu correo con un código.`,
    acciones: [],
    sugerencias: ['¿Cómo pago mi pedido?', '¿Puedo pedir factura?'],
  },
  cancelar: {
    rx: /\b(cancel\w*|anular|anulo|anulacion)\b|me arrepenti|ya no quiero (el|mi) pedido/,
    texto: () => `Desde tu cuenta no puedes cancelar un pedido: lo hace el equipo de NovaTech. Si se cancela, el stock se repone, el pedido pasa a «Cancelado» y te llega un correo. Un pedido cancelado no tiene comprobante. Puedes ver el estado de cada pedido en «Mis pedidos».`,
    acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }],
    sugerencias: ['¿Cómo sigo mi pedido?', '¿Cómo pago mi pedido?'],
  },
  garantia: {
    rx: /\bgarantia\b(?! extendida)|defecto de fabrica|producto (fallado|defectuoso|malogrado)|vino (fallado|malogrado|roto)/,
    texto: () => `Cada producto muestra su garantía en su ficha, en la sección «Garantía». Si no figura un plazo, es un producto original: ante cualquier defecto de fábrica, contáctanos con tu comprobante (lo tienes en tu correo y en «Mis pedidos»). Si estás viendo un producto, pregúntame «¿qué garantía tiene?».`,
    acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }],
    sugerencias: ['¿Cómo descargo mi comprobante?', '¿Qué productos están en oferta?'],
  },
  igv: {
    rx: /\b(igv|impuesto|impuestos)\b|incluye(n)? (el )?igv|precio final|precios incluyen|con igv|sin igv/,
    texto: () => `Todos los precios de la tienda ya incluyen el IGV (18 %). En el resumen del pago verás el subtotal sin IGV, el IGV y el envío por separado. El envío se suma al total y es gratis en compras desde ${soles(free())}.`,
    acciones: [],
    sugerencias: ['¿Cuánto cuesta el envío?', '¿Puedo pedir factura?'],
  },
  stock: {
    rx: /\b(agotado|agotados|reposicion|reponen)\b|sin stock|cuando (llega|llegan|vuelve|vuelven|reponen)|ultimas unidades|cuanto stock/,
    texto: () => `Cada producto muestra su stock. Cuando quedan 3 o menos aparece «¡Últimas N!», y si dice «Agotado» no se puede agregar al carrito. No tengo registrada la fecha de reposición. Te puedo mostrar productos parecidos que sí tienen stock: dime la categoría o la marca.`,
    acciones: [{ label: 'Ir a la tienda', href: '/tienda/' }],
    sugerencias: ['¿Qué categorías tienen?', '¿Qué productos están en oferta?'],
  },
  perfil: {
    rx: /\b(cambi|edit|actualiz|modific|corrig)\w* (mi |mis |el |la |de )?(nombre|correo|email|telefono|celular|numero de telefono|documento|dni|perfil|datos)\b|mis datos personales/,
    texto: () => `En Mi cuenta › Mi perfil puedes cambiar tu nombre, tu teléfono (9 dígitos) y tu correo. El documento (DNI, RUC, carné de extranjería o pasaporte) se registra una sola vez y después no se puede modificar. La contraseña se cambia en Mi cuenta › Seguridad.`,
    acciones: [{ label: 'Mi cuenta', href: '/configuracion/' }],
    sugerencias: ['¿Cómo agrego una dirección?', '¿Cómo cambio el color de la tienda?'],
  },
  tema: {
    rx: /\b(apariencia|temas)\b|tema de color|\bcambi\w* (el |los )?(color|colores|tema)\b|modo oscuro|colores de la (tienda|pagina)/,
    texto: () => `En Mi cuenta › Apariencia eliges el tema de color: Clásico NovaTech, Océano o Atardecer. Se aplica al instante y se guarda en tu cuenta (necesitas iniciar sesión). No hay un modo oscuro.`,
    acciones: [{ label: 'Mi cuenta', href: '/configuracion/?s=apariencia' }],
    sugerencias: ['¿Cómo funciona la accesibilidad?'],
  },
  empresa: {
    rx: /acceso empresa|panel (de )?(empresa|administracion|admin)|\b(administrador|admin|backoffice)\b/,
    texto: () => `«Acceso empresa» es solo para el equipo de NovaTech: desde ahí gestionan productos, stock, ventas, usuarios y la auditoría. Si eres cliente, entra con la opción «Cliente» al iniciar sesión.`,
    acciones: [],
    sugerencias: ['¿Cómo creo mi cuenta?', '¿Qué categorías tienen?'],
  },
  pago: {
    rx: /(como|donde|formas?|metodos?|medios?).{0,20}(pag|pagar|pago)|\b(pagar|pago|yape|plin|transferencia|cvv|efectivo|contra entrega)\b|\btarjeta\b(?! (de )?(video|grafica|madre|de red))/,
    texto: () => `Para pagar tu pedido: en el carrito pulsa «Proceder al pago». En el paso 1 confirmas tus datos y la dirección de envío; en el paso 2 eliges el método:
• Tarjeta de crédito o débito: titular, número, vencimiento y CVV. Solo guardamos la marca y los últimos 4 dígitos.
• Yape / Plin: pagas desde tu app y escribes tu teléfono (9 dígitos) y el código de operación de 6 dígitos.
• Transferencia bancaria: indicas el banco y el número de operación de 6 dígitos.
No hay pago en efectivo ni contra entrega. El pedido queda «Pendiente» hasta que el equipo confirma el pago; entonces pasa a «Pagado» y te llega el comprobante por correo.`,
    acciones: [{ label: 'Ver carrito', href: '/carrito/' }],
    sugerencias: ['¿Cuánto cuesta el envío?', '¿Puedo pedir factura?', '¿Cómo sigo mi pedido?'],
  },
  envio: {
    rx: /\b(envio|envios|delivery|despacho|enviar|envian|llega|llegar|demora|tarda|recojo|recoger|shipping|provincia|provincias)\b/,
    texto: () => `Solo hacemos envíos a domicilio, a todo el Perú (no hay recojo en tienda). El costo depende de la zona de tu dirección:
${SHIPPING_ZONES.map((z) => `• ${z.nombre}: ${soles(z.costo)}`).join('\n')}
El envío es gratis en compras desde ${soles(free())}. El monto exacto se calcula en el checkout al elegir la dirección. No tengo registrado un plazo de entrega: el estado se actualiza en «Mis pedidos».`,
    acciones: [{ label: 'Ir al checkout', href: '/checkout/' }],
    sugerencias: ['¿Cómo pago mi pedido?', '¿Cómo sigo mi pedido?'],
  },
  seguimiento: {
    rx: /(seguimiento|rastre|donde esta|estado de mi|estados del pedido|mis pedidos|mis compras|mi pedido|mi compra|que significa (pendiente|pagado|preparando|en camino))/,
    texto: () => `Puedes seguir tus compras en «Mis pedidos» (menú de tu cuenta). Cada pedido muestra su línea de tiempo:
• Pendiente: esperando que el equipo confirme tu pago.
• Pagado: pago confirmado; te llega el comprobante.
• Preparando: están armando tu pedido.
• En camino: ya salió hacia tu dirección.
• Entregado.
También puede quedar «Cancelado» o «Reembolsado». Te enviamos un correo cada vez que cambia de estado.`,
    acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }],
    sugerencias: ['¿Cómo descargo mi comprobante?', '¿Cuánto cuesta el envío?'],
  },
  comprobante: {
    rx: /\b(comprobante|boleta|factura|ruc|recibo|razon social|pdf)\b/,
    texto: () => `En el paso de pago eliges Boleta o Factura. Para Factura necesitas un RUC de 11 dígitos y la razón social. El comprobante en PDF llega adjunto al correo de tu compra y, cuando el pago está confirmado, también puedes descargarlo desde «Mis pedidos».`,
    acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }],
    sugerencias: ['¿Cómo pago mi pedido?', '¿Cómo sigo mi pedido?'],
  },
  cuenta: {
    rx: /(crear (una |mi )?cuenta|registr|iniciar sesion|inicio de sesion|login|olvide|contrasena|clave|codigo de verificacion|codigo otp|cerrar sesion|no me llega el codigo)/,
    texto: () => `Para crear tu cuenta pulsa «Iniciar sesión» › «Crear cuenta», completa tus datos y escribe el código de 6 caracteres que te enviamos al correo (vence en 10 minutos; si no llega, revisa spam o pide otro después de 60 segundos). Si olvidaste tu contraseña, en la misma ventana pulsa «¿Olvidaste tu contraseña?»: te llega un código válido por 15 minutos. Después de 5 intentos fallidos la cuenta se bloquea 15 minutos.`,
    acciones: [],
    sugerencias: ['¿Cómo agrego una dirección?', '¿Es seguro comprar aquí?'],
  },
  direcciones: {
    rx: /\b(direccion|direcciones|domicilio|codigo postal)\b/,
    texto: () => `Tus direcciones están en Mi cuenta › Mis direcciones. Pide alias, destinatario, dirección, distrito, provincia y código postal de 5 dígitos. Puedes marcar una como principal: el checkout la elige sola. También puedes agregar una nueva durante el pago.`,
    acciones: [{ label: 'Mis direcciones', href: '/configuracion/?s=direcciones' }],
    sugerencias: ['¿Cuánto cuesta el envío?', '¿Cómo pago mi pedido?'],
  },
  carrito: {
    rx: /\b(carrito|cesta|agregar al carrito|quitar del carrito|vaciar)\b/,
    texto: () => `En el carrito puedes sumar o restar unidades (hasta el stock disponible) y quitar productos. Se guarda entre sesiones y dispositivos cuando inicias sesión. Para comprar pulsa «Proceder al pago». También puedo agregar productos por ti: dime «agrega el primero» o el nombre del producto.`,
    acciones: [{ label: 'Ver carrito', href: '/carrito/' }],
    sugerencias: ['¿Cómo pago mi pedido?', '¿Cuánto cuesta el envío?'],
  },
  comparar: {
    rx: /\b(comparar|comparador|comparacion|favorito|favoritos|lista de deseos)\b/,
    texto: () => `Para comparar, pulsa el botón «Comparar» (icono de capas) en 2 o 3 productos y luego «Comparar» en la barra inferior: verás precio, stock y características lado a lado, con las diferencias resaltadas. Los favoritos se guardan con el corazón y requieren iniciar sesión.`,
    acciones: [{ label: 'Abrir comparador', href: '/comparar/' }],
    sugerencias: ['Laptops de menos de 3000 soles', '¿Qué productos están en oferta?'],
  },
  accesibilidad: {
    rx: /(accesibilidad|accesible|ciego|ciega|discapacidad|baja vision|lector de pantalla|narrador|atajo|atajos|por voz|dictar|dictado|\bteclas?\b|(solo|navegar|usar|uso) (con )?(el )?teclado)/, // «teclado logitech» es un producto
    texto: () => `NovaTech se puede usar sin ver la pantalla:
• Al entrar te preguntamos si tienes discapacidad visual: la tecla F activa el narrador, que lee cada control.
• Te mueves con las flechas y activas con Enter. En un producto, Enter lo agrega al carrito; luego F te lleva al carrito y J sigue con el siguiente.
• En el pago te guío por voz y completas los datos hablando; la tecla G retoma la guía. La contraseña, el número de tarjeta y el CVV siempre se escriben con el teclado.
• La tecla J abre esta conversación con el micrófono encendido.
• Alt + A vuelve a abrir el asistente de accesibilidad.`,
    acciones: [{ label: 'Abrir accesibilidad', accion: 'abrir-accesibilidad' }],
    sugerencias: ['¿Cómo pago mi pedido?', '¿Qué productos están en oferta?'],
  },
};
// Temas sobre los que NO hay información registrada: Nova lo dice en vez de inventar.
export const UNKNOWN_TOPICS = /\b(devolucion|devoluciones|reembolso|cambio de producto|garantia extendida|cuotas|intereses|horario|horarios|telefono de la tienda|whatsapp|tienda fisica|direccion de la tienda|cupon|cupones|codigo de descuento|delivery express)\b/;
export const UNKNOWN_TEXT = 'No tengo ese dato registrado, así que prefiero no inventarlo. Para eso es mejor consultar directamente con el equipo de NovaTech. Sí puedo ayudarte con productos, precios, stock, pagos, envíos, comprobantes, garantía, tu cuenta y la accesibilidad.';
