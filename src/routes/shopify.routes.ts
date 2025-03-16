import { Router } from 'express';
import { shopifyController, shopifyProductController } from '../controller';
import { VendorAuthMiddleware } from '../middlewares/vendorAuth.middleware';

const router = Router();

router.post('/connect', VendorAuthMiddleware, shopifyController.connectShopifyStore); // connect shopify store

router.get('/product/list', VendorAuthMiddleware, shopifyProductController.getShopifyProductList); // get category list

export { router as shopifyRouter }; 