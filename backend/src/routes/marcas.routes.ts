import { Router } from 'express';
import { getMarcas, postMarca, putMarca, deleteMarcaCtrl } from '../controllers/marcas.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.get('/marcas', getMarcas);
router.post('/marcas', verifyToken, requireAdmin, postMarca);
router.put('/marcas/:id', verifyToken, requireAdmin, putMarca);
router.delete('/marcas/:id', verifyToken, requireAdmin, deleteMarcaCtrl);

export default router;
