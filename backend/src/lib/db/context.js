// Quién hace la petición en curso (para los campos de auditoría de cada documento).
// AsyncLocalStorage lo lleva por toda la petición sin pasarlo a mano a cada db.put().
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
/** Ejecuta fn dentro de una petición (cada una tiene su propio «actor»). */
export const runRequest = (fn) => als.run({ actor: null }, fn);
/** Lo fija requireAuth cuando la sesión es válida. */
export const setActor = (user) => { const s = als.getStore(); if (s && user) s.actor = { id: user.id, nombre: user.nombre }; };
/** { id, nombre } del usuario autenticado, o null (registro, tareas del sistema). */
export const getActor = () => als.getStore()?.actor || null;
