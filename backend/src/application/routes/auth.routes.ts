import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, register, forgotPassword, resetPassword, forgotPasswordCode, resetPasswordByCode, changePassword, updateProfile, googleLogin } from '../controllers/auth.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes de código. Intenta de nuevo en 15 minutos.' }
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de registro. Intenta de nuevo en 15 minutos.' }
});

const router = Router();

router.post('/login', loginLimiter, login);
router.post('/register', registerLimiter, register);
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/forgot-password-code', otpLimiter, forgotPasswordCode);
router.post('/reset-password-code', resetPasswordByCode);
router.post('/change-password', verifyToken, changePassword);
router.put('/update-profile', verifyToken, updateProfile);

router.post('/google', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }), googleLogin);

export default router;
