export type AssistantActionId =
  | 'open_accessibility'
  | 'open_catalog'
  | 'open_cart'
  | 'open_favorites'
  | 'open_orders'
  | 'open_login'
  | 'focus_catalog_search'
  | 'show_product';

export type GeneralActionId = Exclude<AssistantActionId, 'show_product'>;

export const ACTION_LABELS: Record<GeneralActionId, string> = {
  open_accessibility: 'Abrir accesibilidad',
  open_catalog: 'Ver catálogo',
  open_cart: 'Ver carrito',
  open_favorites: 'Ver favoritos',
  open_orders: 'Ver mis compras',
  open_login: 'Iniciar sesión',
  focus_catalog_search: 'Ir al buscador'
};

export interface HelpTopic {
  id: string;
  summary: string;
  keywords: string[];
  answer: string;
  actions: GeneralActionId[];
  priority?: 'strong' | 'generic';
}

export const FALLBACK_ANSWER = 'No encontré una respuesta para eso. Puedo buscar productos, por ejemplo «monitor de menos de 1500 soles», o explicarte el carrito, la compra y las ayudas de accesibilidad.';

export const CLARIFY_ANSWER = '¿A qué productos te refieres? Dime el nombre o vuelve a buscarlos, por ejemplo «laptops de menos de 3000 soles».';

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'politicas',
    summary: 'devoluciones, garantía, horarios, contacto u otras políticas',
    priority: 'strong',
    keywords: ['devolucion', 'devoluciones', 'devolver', 'garantia', 'reembolso', 'cambio de producto', 'horario', 'horarios',
      'atencion al cliente', 'telefono', 'contacto', 'contactar', 'tienda fisica', 'whatsapp'],
    answer: 'No tengo información confirmada sobre eso, así que prefiero no adivinar. Puedo ayudarte con productos, el carrito, la compra o las ayudas de accesibilidad.',
    actions: ['open_catalog']
  },
  {
    id: 'envio',
    summary: 'costo o plazos de envío',
    priority: 'strong',
    keywords: ['envio', 'envios', 'enviar', 'envian', 'delivery', 'despacho', 'entrega', 'entregan', 'demora', 'cuanto tarda',
      'cuando llega', 'llega mi pedido'],
    answer: 'El costo de envío depende del distrito de tu dirección y aparece al elegirla en el paso «Dirección de envío» del pedido. No tengo información confirmada sobre plazos de entrega.',
    actions: ['open_cart']
  },
  {
    id: 'pago',
    summary: 'métodos de pago',
    priority: 'strong',
    keywords: ['metodo de pago', 'metodos de pago', 'forma de pago', 'formas de pago', 'como pago', 'como pagar', 'pagar con',
      'tarjeta', 'yape', 'plin', 'transferencia', 'efectivo', 'contra entrega'],
    answer: 'Puedes pagar con tarjeta de crédito o débito, con Yape o Plin, o por transferencia bancaria. Se elige en el paso «Método de pago» del pedido.',
    actions: ['open_cart']
  },
  {
    id: 'miscompras',
    summary: 'pedidos ya realizados, su estado o comprobante',
    keywords: ['mis compras', 'mis pedidos', 'historial', 'estado de mi pedido', 'estado del pedido', 'seguimiento', 'comprobante',
      'boleta', 'factura'],
    answer: 'Con tu sesión iniciada, en «Mis compras» ves tus pedidos, su estado y su comprobante.',
    actions: ['open_orders']
  },
  {
    id: 'cuenta',
    summary: 'iniciar sesión, registrarse, contraseña o Google',
    keywords: ['iniciar sesion', 'inicio sesion', 'inicio de sesion', 'login', 'loguear', 'registrar', 'registrarme', 'registro',
      'crear cuenta', 'crear una cuenta', 'mi cuenta', 'contrasena', 'olvide', 'google', 'cerrar sesion'],
    answer: 'Pulsa «Iniciar sesión» en el menú. Ahí puedes entrar con tu correo, crear una cuenta, continuar con Google o recuperar tu contraseña.',
    actions: ['open_login']
  },
  {
    id: 'agregar',
    summary: 'cómo agregar productos al carrito',
    keywords: ['agregar al carrito', 'anadir al carrito', 'agrego', 'anado', 'meter al carrito', 'poner en el carrito',
      'agregar un producto', 'anadir un producto'],
    answer: 'Pulsa «Agregar al carrito» en la tarjeta del producto o en su página. Si dice «Sin stock», ese producto no está disponible por ahora.',
    actions: ['open_catalog']
  },
  {
    id: 'compra',
    summary: 'cómo finalizar una compra o pedido',
    keywords: ['comprar', 'compra', 'compro', 'checkout', 'finalizar', 'pagar', 'proceder al pago', 'hacer un pedido', 'hacer pedido',
      'realizar pedido', 'confirmar pedido', 'pedido'],
    answer: 'En «Carrito de compras» pulsa «Proceder al pago»; necesitas iniciar sesión. El pedido tiene tres pasos: resumen, dirección de envío y método de pago. Al terminar verás «¡Pedido confirmado!».',
    actions: ['open_cart']
  },
  {
    id: 'carrito',
    summary: 'ver o editar el carrito',
    keywords: ['carrito', 'mi carrito', 'cesta', 'canasta', 'vaciar', 'quitar producto', 'quitar un producto', 'eliminar producto',
      'cambiar cantidad', 'cantidades'],
    answer: 'El icono del carrito, arriba a la derecha, muestra un resumen rápido. En «Carrito de compras» puedes cambiar cantidades, quitar productos o vaciarlo, y «Proceder al pago» te lleva al pedido.',
    actions: ['open_cart']
  },
  {
    id: 'comparar',
    summary: 'comparar productos',
    keywords: ['comparar', 'comparo', 'comparador', 'comparacion', 'comparativa', 'diferencias entre productos'],
    answer: 'En el catálogo, marca el icono de comparar en 2 o 3 productos y pulsa «Comparar». Puedes comparar hasta 3 a la vez.',
    actions: ['open_catalog']
  },
  {
    id: 'favoritos',
    summary: 'guardar productos favoritos',
    keywords: ['favorito', 'favoritos', 'guardar producto', 'guardar un producto', 'corazon', 'lista de deseos', 'me gusta'],
    answer: 'Pulsa el corazón de un producto para guardarlo; lo encontrarás en «Favoritos».',
    actions: ['open_favorites']
  },
  {
    id: 'narrador',
    summary: 'narrador que lee los controles',
    keywords: ['narrador', 'narrar', 'narracion', 'lector de pantalla', 'lea los botones', 'leer los botones', 'que me lea', 'silenciar'],
    answer: 'El narrador dice el nombre de cada control al moverte con el teclado. Actívalo con «Activar narrador» en el panel de Accesibilidad; el mismo botón lo silencia. Funciona en la tienda, los productos, el carrito y el pedido, y nunca lee lo que escribes.',
    actions: ['open_accessibility']
  },
  {
    id: 'escuchar',
    summary: 'escuchar textos o productos en voz alta',
    keywords: ['escuchar', 'escucha', 'en voz alta', 'leer en voz', 'audio', 'que me lean', 'leer la pagina', 'leer el producto'],
    answer: 'En la página de cada producto está «Escuchar producto»; con «Texto y contraste» activo también aparece en el catálogo. La barra «Tus ayudas» tiene «Escuchar ayuda de esta página», y «Detener lectura» corta la voz.',
    actions: ['open_accessibility']
  },
  {
    id: 'accesibilidad',
    summary: 'perfiles de accesibilidad, texto grande o contraste',
    keywords: ['accesibilidad', 'accesible', 'texto grande', 'letra grande', 'letras grandes', 'agrandar', 'contraste', 'baja vision',
      'no veo bien', 'veo mal', 'controles amplios', 'botones grandes', 'ayudas', 'discapacidad'],
    answer: 'Pulsa «Accesibilidad» en la cabecera. Puedes elegir «Texto y contraste» (letra más grande y más contraste) y «Controles amplios y navegación» (botones más grandes, foco visible y accesos rápidos). Se guardan con «Aplicar y continuar», y «Restaurar vista habitual» las quita.',
    actions: ['open_accessibility']
  },
  {
    id: 'teclado',
    summary: 'navegar con el teclado',
    keywords: ['con el teclado', 'con teclado', 'usar el teclado', 'solo teclado', 'tab', 'shift', 'retroceder', 'retrocedo', 'regresar',
      'regreso', 'volver atras', 'avanzar', 'avanzo', 'flechas', 'navegar', 'navego', 'atajos', 'sin mouse', 'sin raton'],
    answer: 'Tab avanza al siguiente control y Shift + Tab regresa al anterior. Enter activa botones y enlaces, Espacio marca opciones y Escape cierra ventanas. En el catálogo también sirven las flechas; en otras páginas, actívalas con «Controles amplios y navegación».',
    actions: ['open_accessibility']
  },
  {
    id: 'buscar',
    summary: 'cómo usar el buscador o los filtros',
    keywords: ['buscador', 'como busco', 'como buscar', 'donde busco', 'filtrar', 'filtros', 'filtro'],
    answer: 'Usa el campo «¿Qué estás buscando?» del catálogo o los filtros de categorías y marcas. También puedes preguntarme, por ejemplo: «monitor de menos de 1500 soles».',
    actions: ['focus_catalog_search']
  },
  {
    id: 'gracias',
    summary: 'agradecimientos o despedidas',
    priority: 'generic',
    keywords: ['gracias', 'muchas gracias', 'genial', 'perfecto', 'ok', 'vale', 'listo'],
    answer: '¡De nada! Si necesitas algo más, aquí estoy.',
    actions: []
  },
  {
    id: 'saludo',
    summary: 'saludos o qué puede hacer Nova',
    priority: 'generic',
    keywords: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'que puedes hacer', 'que haces', 'quien eres',
      'que eres', 'ayuda', 'ayudame', 'necesito ayuda'],
    answer: 'Hola, soy Nova. Puedo buscar productos por nombre, categoría, marca o precio, y explicarte cómo usar la tienda: carrito, compra, favoritos y accesibilidad.',
    actions: ['open_catalog']
  }
];
