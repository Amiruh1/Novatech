import { Request, Response } from 'express';
import { answerQuery, AssistantQuery, AssistantTurn } from '../../business/services/assistant.service';

const MAX_MESSAGE = 1000;
const MAX_HISTORY = 6;
const MAX_HISTORY_CHARS = 4000;

function parseQuery(body: unknown): { query: AssistantQuery } | { error: string } {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const message = typeof data['message'] === 'string' ? data['message'].replace(/\s+/g, ' ').trim() : '';
  if (!message) return { error: 'Escribe una pregunta.' };
  if (message.length > MAX_MESSAGE) return { error: `La pregunta puede tener hasta ${MAX_MESSAGE} caracteres.` };

  const rawRoute = typeof data['route'] === 'string' ? data['route'].split(/[?#]/)[0] : '';
  const route = rawRoute.length <= 120 && /^\/[\w\-/]*$/.test(rawRoute) ? rawRoute : '/';

  const rawIds = Array.isArray(data['productIds']) ? data['productIds'] : [];
  const productIds = [...new Set(rawIds.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 5);

  const rawHistory = data['history'] ?? [];
  if (!Array.isArray(rawHistory) || rawHistory.length > MAX_HISTORY) return { error: 'El historial de la conversación no es válido.' };
  const history: AssistantTurn[] = [];
  let total = 0;
  for (const item of rawHistory) {
    const turn = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const role = turn['role'];
    const text = typeof turn['text'] === 'string' ? turn['text'].replace(/\s+/g, ' ').trim() : '';
    if ((role !== 'user' && role !== 'assistant') || !text || text.length > MAX_MESSAGE) {
      return { error: 'El historial de la conversación no es válido.' };
    }
    total += text.length;
    history.push({ role, text });
  }
  if (total > MAX_HISTORY_CHARS) return { error: 'El historial de la conversación es demasiado largo.' };

  return { query: { message, route, productIds, history } };
}

export async function postAssistantQuery(req: Request, res: Response) {
  const parsed = parseQuery(req.body);
  if ('error' in parsed) return res.status(400).json({ message: parsed.error });
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const reply = await answerQuery(parsed.query, controller.signal);
    if (controller.signal.aborted) return;
    return res.json(reply);
  } catch {
    if (controller.signal.aborted) return;
    return res.status(503).json({ message: 'Nova no pudo responder en este momento. Intenta de nuevo en unos segundos.' });
  }
}
