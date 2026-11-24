let pending;
export function getDb() {
  // Si la conexión falla (p. ej. un corte de red), se olvida para reintentar en la próxima petición.
  pending ||= import('./mongo.js').then((m) => m.createMongoDb()).catch((e) => { pending = null; throw e; });
  return pending;
}
export function setDb(db) { pending = Promise.resolve(db); } // para pruebas
