import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { postAssistantQuery } from '../controllers/assistant.controller';

const router = Router();

const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Hiciste muchas preguntas seguidas. Espera un momento y vuelve a intentarlo.' }
});

router.post('/asistente/consulta', assistantLimiter, postAssistantQuery);

export default router;
