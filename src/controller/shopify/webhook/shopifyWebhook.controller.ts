import { Request, Response } from "express";
import {
  CollaborationModel,
  CreatorModel,
  ImpressionModel,
  OrderModel,
  ProductModel,
  VendorModel,
} from "../../../database/model";
import { addCommotion, deductCommotion } from "../../../common/wallet/walletTransaction";

const attributedOrder = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    console.log("order data", data);
    // Extract order details from the webhook payload
    const orderId = data.order_data?.id;
    const orderAmount = parseFloat(data.order_data?.total_price || "0");
    const orderDate = data.order_data?.created_at;

    // Validate required fields
    if (!orderId || !orderAmount || !orderDate) {
      throw new Error("Missing required order data from Shopify webhook.");
    }

    // Extract collaborationId from affiliateId (e.g., "xyz-<collaborationId>")
    const affiliateId = data.attribution_data?.affiliateId;
    if (!affiliateId || !affiliateId.includes("-")) {
      throw new Error("Invalid or missing affiliateId in attribution data.");
    }
    const collaborationId = affiliateId.split("-")[1];
    const channel = "shopify";

    // Find the collaboration
    const collaboration = await CollaborationModel.findById(collaborationId);
    if (!collaboration) {
      throw new Error(`Collaboration with ID ${collaborationId} not found.`);
    }

    // Find the associated product
    const product = await ProductModel.findById(collaboration.productId);
    if (!product) {
      throw new Error(`Product with ID ${collaboration.productId} not found.`);
    }

    const calculatedCommission =
      collaboration.commissionType === "PERCENTAGE"
        ? orderAmount * (collaboration.commissionValue / 100)
        : collaboration.commissionValue;

    // Create and store the order in our application database
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

    const vendor: any = await VendorModel.findById(collaboration.vendorId);
    const creator: any = await CreatorModel.findById(collaboration.creatorId);

    await deductCommotion(vendor?.accountId.toString(), calculatedCommission);
    await addCommotion(creator?.accountId.toString(), calculatedCommission, true);

    return order;
  } catch (error: any) {
    console.error("Error in attributedOrder:", error.message || error);
    return null;
  }
};

const shopifyOrderStatus = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    console.log("order status data", data);
    if (data.event_type === "order_delivered") {
      console.log("order delivered");
    }else if(data.event_type === "order_cancelled" || data.event_type === "order_refunded"){
      console.log("order cancelled or refunded");
    }
  } catch (error: any) {
    console.error("Error in shopifyOrderStatus:", error.message || error);
  }
}

const shopifyVisitEvent = async (req: Request, res: Response) => {
  try {
    // const data = { utmapp_link_id : "fekmkmfkemf" }
    const data = req.body;
    console.log("visit", data);

    const collaboration = await CollaborationModel.findOne({
      utmLinkIdentifier: data.utmapp_link_id,
    });
    if (!collaboration) {
      throw new Error(
        `Collaboration with ID ${data.utmapp_link_id} not found.`
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
export { attributedOrder, shopifyVisitEvent, shopifyOrderStatus };
