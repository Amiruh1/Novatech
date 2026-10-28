import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getAdminSales,
  getComprobantePDF,
  getSalesByUser,
  postSale,
  putConfirmarPago,
  putSaleStatus
} from '../controllers/sales.controller';
import { requireAdmin, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

const ventasLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes de venta. Intente en unos minutos.' }
});

router.post('/ventas', verifyToken, ventasLimiter, postSale);
router.get('/ventas/:id/comprobante', verifyToken, getComprobantePDF);
router.get('/ventas/:idUsuario', verifyToken, getSalesByUser);
router.get('/admin/ventas', verifyToken, requireAdmin, getAdminSales);
router.put('/ventas/:id/estado', verifyToken, requireAdmin, putSaleStatus);
router.put('/ventas/:id/confirmar-pago', verifyToken, requireAdmin, putConfirmarPago);

export default router;
