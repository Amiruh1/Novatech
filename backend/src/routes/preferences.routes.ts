import { Router } from 'express';
import { getMyCarrito, getMyPreferences, putComparador, putFavoritos, putMyCarrito } from '../controllers/preferences.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/preferencias', verifyToken, getMyPreferences);
router.put('/preferencias/favoritos', verifyToken, putFavoritos);
router.put('/preferencias/comparador', verifyToken, putComparador);
router.get('/preferencias/carrito', verifyToken, getMyCarrito);
router.put('/preferencias/carrito', verifyToken, putMyCarrito);

export default router;
