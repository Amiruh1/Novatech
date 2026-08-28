import { Router } from 'express';
import { getCategories } from '../controllers/products.controller';

const router = Router();

router.get('/catalogos/categorias', getCategories);

export default router;
