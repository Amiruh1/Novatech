import { Router } from 'express';
import { getBanners, postBanner, putBanner, removeBanner } from '../controllers/banners.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', getBanners);

router.post('/', verifyToken, requireAdmin, postBanner);
router.put('/:id', verifyToken, requireAdmin, putBanner);
router.delete('/:id', verifyToken, requireAdmin, removeBanner);

export default router;
