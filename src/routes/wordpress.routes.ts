import { Router } from 'express';
import { VendorAuthMiddleware } from '../middlewares/vendorAuth.middleware';
import { authorizeWordpress } from '../controller/wordpress/wordpress-auth.controller';
import { getWordpressProductDetails, getWordpressProductList } from '../controller/wordpress/wordpress-products.controller';

const router = Router();

router.post('/connect', VendorAuthMiddleware, authorizeWordpress); // connect wordpress store

router.get('/product/list', VendorAuthMiddleware, getWordpressProductList); // get product list

router.get('/product', VendorAuthMiddleware, getWordpressProductDetails); // get product by id

// router.post('/utm/create', VendorAuthMiddleware, shopifyController.generateShopifyUTM); // create shopify utm

// router.post('/sales', getSalesFromShopify); // get sales from shopify

// router.get('/collaborationList', getShopifyCollaborationList);

// router.post('/request', acceptedShopifyCollaboration);

export { router as wordpressRouter }; 