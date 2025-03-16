import { Router } from 'express';
import { vendorChannelController } from '../../controller';
import { VendorAuthMiddleware } from '../../middlewares/vendorAuth.middleware';

const router = Router();

router.get('/list', VendorAuthMiddleware, vendorChannelController.getVendorChannelsList);

export { router as vendorChannelRouter }; 