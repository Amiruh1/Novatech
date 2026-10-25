import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './src/routes/auth.routes';
import usersRoutes from './src/routes/users.routes';
import productsRoutes from './src/routes/products.routes';
import salesRoutes from './src/routes/sales.routes';
import catalogRoutes from './src/routes/catalog.routes';
import preferenciasRoutes from './src/routes/preferences.routes';
import direccionesRoutes from './src/routes/direcciones.routes';
import bannersRoutes from './src/routes/banners.routes';
import categoriesRoutes from './src/routes/categories.routes';
import marcasRoutes from './src/routes/marcas.routes';
import assistantRoutes from './src/routes/assistant.routes';
import { errorHandler, notFoundHandler } from './src/middlewares/error.middleware';

dotenv.config();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',')
  .map(o => o.trim());

const app = express();
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

app.use('/api', authRoutes);
app.use('/api', usersRoutes);
app.use('/api', productsRoutes);
app.use('/api', salesRoutes);
app.use('/api', catalogRoutes);
app.use('/api', preferenciasRoutes);
app.use('/api', direccionesRoutes);
app.use('/api/banners', bannersRoutes);
app.use('/api', categoriesRoutes);
app.use('/api', marcasRoutes);
app.use('/api', assistantRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
    console.log(`Servidor TypeScript corriendo en http://localhost:${port}`);
});
