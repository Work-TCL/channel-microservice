import { Router } from 'express';
import { shopifyRouter } from './shopify';

const router = Router()

router.use('/shopify', shopifyRouter)

export { router }