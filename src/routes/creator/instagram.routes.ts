import { Router } from 'express';
import { instagramAuthController } from '../../controller';

const router = Router();

router.get('/auth/callback',instagramAuthController.handleInstagramAuthCallback); // get instagram auth callback

router.get('/dummy',()=>{console.log("object")})
// router.get('/user-data', instagramAuthController.getInstagramVideoStats);

export { router as instagramRouter }; 