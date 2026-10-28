import { Router } from 'express';
import { getCategoriesFull, postCategory, putCategory, removeCategory } from '../controllers/categories.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.get('/categorias', getCategoriesFull);

router.post('/categorias', verifyToken, requireAdmin, postCategory);
router.put('/categorias/:id', verifyToken, requireAdmin, putCategory);
router.delete('/categorias/:id', verifyToken, requireAdmin, removeCategory);

export default router;
