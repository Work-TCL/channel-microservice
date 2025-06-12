import { Router } from 'express';
import { shopifyRouter } from './shopify.routes';
import { creatorRouter } from './creator/creator.routes';
import { vendorChannelRouter } from './vendor/channel.routes';
import { salesRouter } from './sales.routes';
import { shopifyWebhookRouter } from './webhooks/shopify/shopifyWebhook.routes';
import { wordpressRouter } from './wordpress.routes';

const router = Router()

router.use('/shopify', shopifyRouter)

router.use('/wordpress', wordpressRouter)

router.use('/creator', creatorRouter)

router.use('/vendor/channel', vendorChannelRouter)

router.use('/sales', salesRouter)

router.use('/', shopifyWebhookRouter)

export { router }