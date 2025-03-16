import { Router } from 'express';
import { shopifyRouter } from './shopify.routes';
import { creatorRouter } from './creator/creator.routes';
import { vendorChannelRouter } from './vendor/channel.routes';

const router = Router()

router.use('/shopify', shopifyRouter)

router.use('/creator', creatorRouter)

router.use('/vendor/channel', vendorChannelRouter)

export { router }