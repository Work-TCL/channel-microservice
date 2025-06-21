import { Router } from "express";
import { wordPressWebhook } from "../../../controller/wordpress/wordpress-webhook.controller";

const router = Router();

router.post("/wordpress/webhook/utmapp/attributed-order", wordPressWebhook);

export { router as  wordpressWebhookRouter}