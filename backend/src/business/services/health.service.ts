import { probeDatabase } from '../../access-data/repositories/health.repository';

export async function checkReadiness(): Promise<boolean> {
  try {
    await probeDatabase();
    return true;
  } catch {
    return false;
  }
}
