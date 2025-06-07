import { Request, Response } from "express";
import sendApiResponse from "../../../common";
import {
  CollaborationModel,
  ImpressionModel,
  OrderModel,
  ProductModel,
} from "../../../database/model";

const attributedOrder = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    console.log("data", data);
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

    console.log("Received Shopify webhook data:", {
      orderId,
      orderAmount,
      orderDate,
      collaborationId,
    });

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
    return order;
  } catch (error: any) {
    console.error("Error in attributedOrder:", error.message || error);
    return null;
  }
};

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
export { attributedOrder, shopifyVisitEvent };
