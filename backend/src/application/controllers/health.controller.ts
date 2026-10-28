import type { Request, Response } from 'express';
import { checkReadiness } from '../../business/services/health.service';

export function getHealth(_req: Request, res: Response) {
  return res.json({ status: 'ok' });
}

export async function getReadiness(_req: Request, res: Response) {
  const ready = await checkReadiness();
  return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
}
