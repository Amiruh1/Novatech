import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
// Id de documento: un ObjectId de MongoDB en texto (24 hex). Es ordenable por fecha de creación
// y se guarda como ObjectId real en la base (ver lib/db/schema.js).
export const newId = () => new ObjectId().toHexString();
export const saleCode = () => {
  const d = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `NT-${d}-${randomBytes(2).toString('hex').toUpperCase()}`;
};
