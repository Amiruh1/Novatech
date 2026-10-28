import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getProducts,
  getProductById,
  getCategories,
  getSubcategories,
  getBrands,
  postProduct,
  putProduct,
  putProductStock,
  adjustStock,
  removeProduct,
  getProductMovements
} from '../controllers/products.controller';
import { requireAdmin, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

const catalogoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes al catálogo. Intente en un momento.' }
});

const adminWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Límite de operaciones administrativas alcanzado.' }
});

router.get('/productos', catalogoLimiter, getProducts);
router.get('/productos/:id', catalogoLimiter, getProductById);
router.get('/catalogos/categorias', catalogoLimiter, getCategories);
router.get('/catalogos/subcategorias', catalogoLimiter, getSubcategories);
router.get('/catalogos/marcas', catalogoLimiter, getBrands);
router.post('/productos', verifyToken, requireAdmin, adminWriteLimiter, postProduct);
router.put('/productos/:id', verifyToken, requireAdmin, adminWriteLimiter, putProduct);
router.put('/productos/:id/stock', verifyToken, requireAdmin, adminWriteLimiter, putProductStock);
router.put('/productos/:id/ajuste-stock', verifyToken, requireAdmin, adminWriteLimiter, adjustStock);
router.get('/productos/:id/movimientos', verifyToken, requireAdmin, getProductMovements);
router.delete('/productos/:id', verifyToken, requireAdmin, adminWriteLimiter, removeProduct);

export default router;
