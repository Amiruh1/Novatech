import { Router } from 'express';
import { listarDirecciones, agregarDireccion, editarDireccion, eliminarDireccion } from '../controllers/direcciones.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/direcciones', verifyToken, listarDirecciones);
router.post('/direcciones', verifyToken, agregarDireccion);
router.put('/direcciones/:id', verifyToken, editarDireccion);
router.delete('/direcciones/:id', verifyToken, eliminarDireccion);

export default router;
