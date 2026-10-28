import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getUsers, postUser, putUser, removeUser, patchUserActivo } from '../controllers/users.controller';
import { requireAdmin, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

const adminUsersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Límite de operaciones de usuarios alcanzado.' }
});

router.get('/usuarios', verifyToken, requireAdmin, getUsers);
router.post('/usuarios', verifyToken, requireAdmin, adminUsersLimiter, postUser);
router.put('/usuarios/:id', verifyToken, requireAdmin, adminUsersLimiter, putUser);
router.patch('/usuarios/:id/activo', verifyToken, requireAdmin, adminUsersLimiter, patchUserActivo);
router.delete('/usuarios/:id', verifyToken, requireAdmin, adminUsersLimiter, removeUser);

export default router;
