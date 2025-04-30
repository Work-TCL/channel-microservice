import { Router } from 'express';
import { shopifyController, shopifyProductController } from '../controller';
import { VendorAuthMiddleware } from '../middlewares/vendorAuth.middleware';
import { acceptedShopifyCollaboration, getSalesFromShopify, getShopifyCollaborationList } from '../controller/sales/shopifySales.controller';

const router = Router();

router.post('/connect', VendorAuthMiddleware, shopifyController.connectShopifyStore); // connect shopify store

router.get('/product/list', VendorAuthMiddleware, shopifyProductController.getShopifyProductList); // get product list

router.get('/product', VendorAuthMiddleware, shopifyProductController.getShopifyProductById); // get product by id

router.post('/utm/create', VendorAuthMiddleware, shopifyController.generateShopifyUTM); // create shopify utm

router.post('/sales', getSalesFromShopify); // get sales from shopify

router.get('/collaborationList', getShopifyCollaborationList);

router.post('/request', acceptedShopifyCollaboration);

export { router as shopifyRouter }; 