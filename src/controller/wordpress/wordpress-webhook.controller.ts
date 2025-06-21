import { Request, Response } from "express";
import {
  CollaborationModel,
  CreatorModel,
  ImpressionModel,
  OrderModel,
  ProductModel,
  VendorModel,
} from "../../database/model";
import { blockCommission, deductFromWallet, releaseBlockedToMain, releaseMainToBlocked, removeBlockedCommission } from "../../common/wallet/walletTransaction";

export const wordPressOrderWebhook = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data) return null;

    // Extract required order details
    const orderId = data.orderId;
    const orderAmount = parseFloat(data.totalAmount || "0");
    const orderDate = data?.eventTimestamp;

    if (!orderId || !orderAmount || !orderDate) {
      throw new Error("Missing required order data from WordPress webhook.");
    }

    // Extract collaboration ID from affiliate ID
    const affiliateId = data.crmAffiliateId;
    if (!affiliateId) {
      throw new Error("Missing affiliateId in attribution data.");
    }

    const collaborationId = affiliateId;
    const channel = "wordpress";

    // Validate collaboration
    const collaboration = await CollaborationModel.findById(collaborationId);
    if (!collaboration) {
      throw new Error(`Collaboration with ID ${collaborationId} not found.`);
    }

    // Fetch associated product
    const product = await ProductModel.findById(collaboration.productId);
    if (!product) {
      throw new Error(`Product with ID ${collaboration.productId} not found.`);
    }

    // Calculate commission
    const calculatedCommission =
      collaboration.commissionType === "PERCENTAGE"
        ? orderAmount * (collaboration.commissionValue / 100)
        : collaboration.commissionValue;

    // Store order in database
    const order = await OrderModel.create({
      orderId,
      orderAmount,
      orderDate,
      collaborationId,
      channel,
      productId: product._id,
      channelProductId: product.channelProductId,
      commission: calculatedCommission,
      orderStatus: "PENDING",
    });

    console.log("Order stored successfully:", order);

    // Handle wallet transaction
    const vendor = await VendorModel.findById(collaboration.vendorId).select("accountId");
    const creator = await CreatorModel.findById(collaboration.creatorId).select("accountId");

    if(vendor && calculatedCommission > 0){
        await releaseMainToBlocked(vendor.accountId.toString(), calculatedCommission);
    }
    if(creator && calculatedCommission > 0){
      await blockCommission(creator.accountId.toString(), calculatedCommission);
    }

    return order;
  } catch (e: any) {
    console.error("Error in wordPressWebhook:", e.message || e);
    return null;
  }
};

export const wordpressOrderStatus = async (req: Request, res: Response) => {
  try {
    const { event_type, orderId, crmAffiliateId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    // Validate collaboration
    const collaboration = await CollaborationModel.findById(crmAffiliateId);
    if (!collaboration) {
      throw new Error(`Collaboration with ID ${crmAffiliateId} not found.`);
    }

    // Fetch account IDs for wallet transactions
    const vendor = await VendorModel.findById(collaboration.vendorId).select("accountId");
    const creator = await CreatorModel.findById(collaboration.creatorId).select("accountId");

    if (!vendor?.accountId || !creator?.accountId) {
      throw new Error("Missing account ID for vendor or creator");
    }

    let updatedStatus = "";

    if (event_type === "order_delivered") {
      updatedStatus = "DELIVERED";
    } else if (event_type === "order_cancelled") {
      updatedStatus = "CANCELLED";
    } else if (event_type === "order_refunded") {
      updatedStatus = "RETURNED";
    }

    if (updatedStatus) {
      const result: any = await OrderModel.findOneAndUpdate(
        { orderId },
        { orderStatus: updatedStatus },
        { new: true }
      );

      if (result && result.commission > 0) {
        const vendorId = vendor.accountId.toString();
        const creatorId = creator.accountId.toString();

        if (event_type === "order_delivered") {
          await removeBlockedCommission(vendorId, result.commission);
          await releaseBlockedToMain(creatorId, result.commission);
        } else if (event_type === "order_cancelled" || event_type === "order_refunded") {
          await releaseBlockedToMain(vendorId, result.commission);
          await removeBlockedCommission(creatorId, result.commission);
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error in wordpressOrderStatus:", error.message || error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


export const wordpressVisitEvent = async (req: Request, res: Response) => {
  try {
    // const data = { utmapp_link_id : "fekmkmfkemf" }
    const data = req.body;
    console.log("visit", data);

    const collaboration = await CollaborationModel.findOne({
      utmLinkIdentifier: data.utm_link_id,
    });
    if (!collaboration) {
      throw new Error(
        `Collaboration with ID ${data.utm_link_id} not found.`
      );
    }
    const newImpression = await ImpressionModel.create({
      collaborationId: collaboration._id,
      impression: "VISIT",
      channel: "SHOPIFY",
    });

    return newImpression;
  } catch (error: any) {
    console.error("Error in shopifyVisitEvent:", error.message || error);
    return null;
  }
};
