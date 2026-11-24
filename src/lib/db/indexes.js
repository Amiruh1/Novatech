// Búsquedas por atributo soportadas (en DynamoDB usan el índice GSI1).
export const INDEXES = { user: 'email', sale: 'id_usuario', address: 'usuario_id', movement: 'producto_id' };
export const idxValue = (entity, v) => String(v).toLowerCase();
