import { Router } from 'express';
import { shopifyController, shopifyProductController } from '../controller';

const router = Router();

router.post('/connect', shopifyController.connectShopifyStore); // connect shopify store

router.post('/list', shopifyProductController.getShopifyProductList); // get category list

export { router as shopifyRouter }; 