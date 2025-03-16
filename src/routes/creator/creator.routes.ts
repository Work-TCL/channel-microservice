import { Router } from 'express';
import { instagramRouter } from './instagram.routes';
import { youtubeRouter } from './youtube.routes';

const router = Router();

router.use('/instagram', instagramRouter)

router.use('/youtube', youtubeRouter)

export { router as creatorRouter }; 