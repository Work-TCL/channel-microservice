import { Router } from 'express';
import { shopifyController, shopifyProductController } from '../controller';
import { VendorAuthMiddleware } from '../middlewares/vendorAuth.middleware';

const router = Router();

router.post('/connect', VendorAuthMiddleware, shopifyController.connectShopifyStore); // connect shopify store

router.get('/product/list', VendorAuthMiddleware, shopifyProductController.getShopifyProductList); // get product list

router.get('/product', VendorAuthMiddleware, shopifyProductController.getShopifyProductById); // get product by id

router.post('/utm/create', VendorAuthMiddleware, shopifyController.generateShopifyUTM); // create shopify utm

export { router as shopifyRouter }; 