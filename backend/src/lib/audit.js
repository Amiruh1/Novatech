// RF-47: trazabilidad de eventos críticos del administrador (cambios de estado, ajustes de stock,
// usuarios, catálogo). Cada registro guarda ID, fecha y hora (createdAt), quién lo hizo y la acción.
// Un fallo al auditar nunca debe romper la operación principal.
export async function audit(db, actor, accion, descripcion, extra = {}) {
  try {
    await db.put('audit', {
      accion, descripcion,
      usuario_id: actor?.id ?? null, usuario_nombre: actor?.nombre ?? null, usuario_email: actor?.email ?? null,
      entidad: extra.entidad ?? null, entidad_id: extra.entidad_id ?? null,
      antes: extra.antes ?? null, despues: extra.despues ?? null,
    });
  } catch (e) { console.error('[audit:error]', e.message); }
}
