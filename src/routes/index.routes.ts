import { Router } from 'express';
import { shopifyRouter } from './shopify.routes';
import { creatorRouter } from './creator/creator.routes';

const router = Router()

router.use('/shopify', shopifyRouter)

router.use('/creator', creatorRouter)

export { router }