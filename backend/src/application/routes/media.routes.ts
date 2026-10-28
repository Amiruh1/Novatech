import { Router, raw } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';
import { getPublicImage, postImage } from '../controllers/media.controller';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../business/services/media.service';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Se alcanzó el límite de subidas. Espera unos minutos.' },
});

router.get('/media/images/:filename', getPublicImage);
router.post('/media/images', verifyToken, requireAdmin, limiter,
  raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_BYTES, inflate: false }), postImage);

export default router;
