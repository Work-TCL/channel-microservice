import { Router } from "express";
import { wordpressOrderStatus, wordpressVisitEvent, wordPressWebhook } from "../../../controller/wordpress/wordpress-webhook.controller";

const router = Router();

router.post("/wordpress/webhook/utmapp/attributed-order", wordPressWebhook);

router.post('/wordpress/webhook/utmapp/order-event', wordpressOrderStatus)// order status change webhook

router.post('/wordpress/webhook/utmapp/visit-event', wordpressVisitEvent)

export { router as  wordpressWebhookRouter}