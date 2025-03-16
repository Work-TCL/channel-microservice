import { Router } from 'express';
import {  youtubeController } from '../../controller';
import { creatorAuthMiddleware } from '../../middlewares/creatorAuth.middleware';

const router = Router();

router.get('/validate/channel',creatorAuthMiddleware, youtubeController.validateYoutubeChannel); // validate youtube channel

export { router as youtubeRouter }; 