import * as bannersRepository from '../repositories/banners.repository';

export interface BannerInput {
  imagen: string;
  titulo: string;
  subtitulo?: string;
  link?: string;
  activo?: number;
  orden?: number;
}

export async function listBanners(activeOnly: boolean = false) {
  return bannersRepository.findBanners(activeOnly);
}

export async function createBanner(input: BannerInput) {
  const activo = input.activo !== undefined ? input.activo : 1;
  const orden = input.orden || 0;

  const result = await bannersRepository.insertBanner(input.imagen, input.titulo, input.subtitulo || null, input.link || null, activo, orden);
  return result;
}

export async function updateBanner(id: number, input: BannerInput) {
  const activo = input.activo !== undefined ? input.activo : 1;
  const orden = input.orden || 0;

  await bannersRepository.updateBanner(input.imagen, input.titulo, input.subtitulo || null, input.link || null, activo, orden, id);
}

export async function deleteBanner(id: number) {
  await bannersRepository.deleteBanner(id);
}
