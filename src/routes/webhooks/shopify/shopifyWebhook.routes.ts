import { Router } from 'express';
import { attributedOrder, shopifyOrderStatus, shopifyVisitEvent } from '../../../controller/shopify/webhook/shopifyWebhook.controller';

const router = Router();


router.post('/webhook/utmapp/attributed-order', attributedOrder); // delete category

router.post('/webhook/utmapp/order-event', shopifyOrderStatus)// order status change webhook

router.post('/webhook/utmapp/visit-event', shopifyVisitEvent)


export { router as shopifyWebhookRouter }; 