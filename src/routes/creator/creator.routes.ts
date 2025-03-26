import { Router } from 'express';
import { instagramRouter } from './instagram.routes';
import { youtubeRouter } from './youtube.routes';
import { creatorChannelController } from '../../controller';
import { creatorAuthMiddleware } from '../../middlewares/creatorAuth.middleware';
import { handleGoogleOAuth } from '../../controller/creator/youtube/youtube.controller';

const router = Router();

router.use('/instagram', instagramRouter)

router.use('/youtube', youtubeRouter)

router.use('/youtube/auth/callback', handleGoogleOAuth)

router.get('/list', creatorAuthMiddleware, creatorChannelController.getCreatorChannelList);

export { router as creatorRouter }; 