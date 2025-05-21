import { Router } from 'express';
import { attributedOrder } from '../../../controller/shopify/webhook/shopifyWebhook.controller';

const router = Router();


router.post('/webhook/utmapp/attributed-order', attributedOrder); // delete category

export { router as shopifyWebhookRouter }; 