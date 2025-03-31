import { Router } from 'express';
import { instagramAuthController } from '../../controller';
import { creatorAuthMiddleware } from '../../middlewares/creatorAuth.middleware';

const router = Router();

router.get('/auth/callback',instagramAuthController.handleInstagramAuthCallback); // get instagram auth callback


// router.get('/user-data', instagramAuthController.getInstagramVideoStats);

export { router as instagramRouter }; 