import { Router } from 'express';
import {  youtubeController } from '../../controller';
import { creatorAuthMiddleware } from '../../middlewares/creatorAuth.middleware';

const router = Router();

router.post('/validate/channel',creatorAuthMiddleware, youtubeController.validateYoutubeChannel); // validate youtube channel

export { router as youtubeRouter }; 