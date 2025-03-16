import { Router } from 'express';
import { instagramAuthController } from '../../controller';

const router = Router();

router.get('/auth/callback', instagramAuthController.handleInstagramAuthCallback); // get instagram auth callback

export { router as instagramRouter }; 