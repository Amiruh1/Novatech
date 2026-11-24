import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { handleRequest } from './app.js';

const PORT = Number(process.env.PORT || 4000);
const origins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET debe tener al menos 32 caracteres. Copia backend/.env.example a backend/.env.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY); // detrás de nginx/Caddy/ALB
app.use(helmet());
app.use(cors({ origin: origins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 3600 }));
app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiadas solicitudes. Intenta en un minuto.' } }));
// Límite antifuerza bruta solo para login, registro y recuperación (POST). /auth/me (GET) se pide en cada
// recarga para restaurar la sesión y no debe consumirlo.
app.use('/auth', rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, skip: (req) => req.method === 'GET', message: { message: 'Demasiados intentos. Intenta más tarde.' } }));
// Nova: 20 preguntas por minuto por equipo.
app.use('/nova/chat', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Hiciste muchas preguntas seguidas. Espera un minuto, por favor.' } }));
app.use(express.text({ type: () => true, limit: '100kb' })); // el cuerpo se parsea en app.js (JSON inválido → 400 limpio)

app.use(async (req, res) => {
  const out = await handleRequest({
    method: req.method, path: req.path, query: req.query, headers: { ...req.headers, 'x-client-ip': req.ip },
    rawBody: typeof req.body === 'string' ? req.body : '',
  });
  res.set('Cache-Control', 'no-store');
  res.status(out.status).json(out.body ?? {});
});

app.listen(PORT, () => console.log(`NovaTech API → http://localhost:${PORT}`));
