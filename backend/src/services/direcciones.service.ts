import * as direccionesRepository from '../repositories/direcciones.repository';

export interface DireccionInput {
  alias: string;
  destinatario: string;
  direccion_detallada: string;
  distrito: string;
  provincia: string;
  codigo_postal?: string;
  referencias?: string;
  predeterminada?: boolean;
}

export async function getDirecciones(idUsuario: number) {
  const rows = await direccionesRepository.findAddresses(idUsuario);
  return rows;
}

export async function createDireccion(idUsuario: number, input: DireccionInput) {
  if (input.predeterminada) {
    await direccionesRepository.clearDefaultAddress(idUsuario);
  }

  const result = await direccionesRepository.insertAddress(
    idUsuario,
    input.alias,
    input.destinatario,
    input.direccion_detallada,
    input.distrito,
    input.provincia,
    input.codigo_postal || null,
    input.referencias || null,
    input.predeterminada ? 1 : 0
  );
  return result;
}

export async function updateDireccion(id: number, idUsuario: number, input: DireccionInput) {
  if (input.predeterminada) {
    await direccionesRepository.clearDefaultAddress(idUsuario);
  }

  await direccionesRepository.updateAddress(
    input.alias,
    input.destinatario,
    input.direccion_detallada,
    input.distrito,
    input.provincia,
    input.codigo_postal || null,
    input.referencias || null,
    input.predeterminada ? 1 : 0,
    id,
    idUsuario
  );
}

export async function deleteDireccion(id: number, idUsuario: number) {
  await direccionesRepository.deactivateAddress(id, idUsuario);
}
