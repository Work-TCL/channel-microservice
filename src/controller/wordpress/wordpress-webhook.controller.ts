import { Request, Response } from "express";
import {
  CollaborationModel,
  ImpressionModel,
  OrderModel,
  ProductModel,
} from "../../database/model";

export const wordPressWebhook = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (data) {
      // console.log("order data", data);
      // Extract order details from the webhook payload
      const orderId = data.order_id;
      const orderAmount = parseFloat(data.totalAmount || "0");
      const orderDate = data?.eventTimestamp;

      // Validate required fields
      if (!orderId || !orderAmount || !orderDate) {
        throw new Error("Missing required order data from Shopify webhook.");
      }

      // Extract collaborationId from affiliateId
      const affiliateId = data.crmAffiliateId;
      if (!affiliateId) {
        throw new Error("Invalid or missing affiliateId in attribution data.");
      }
      const collaborationId = affiliateId;
      const channel = "wordpress";

      // Find the collaboration
      const collaboration = await CollaborationModel.findById(collaborationId);
      if (!collaboration) {
        throw new Error(`Collaboration with ID ${collaborationId} not found.`);
      }

      // Find the associated product
      const product = await ProductModel.findById(collaboration.productId);
      if (!product) {
        throw new Error(
          `Product with ID ${collaboration.productId} not found.`
        );
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

      // const vendor: any = await VendorModel.findById(collaboration.vendorId);
      // const creator: any = await CreatorModel.findById(collaboration.creatorId);

      // await deductCommotion(vendor?.accountId.toString(), calculatedCommission);
      // await addCommotion(
      //   creator?.accountId.toString(),
      //   calculatedCommission,
      //   true
      // );

      return order;
    } else {
      return null;
    }
  } catch (e: any) {
    console.error("Error in attributedOrder:", e.message || e);
    return null;
  }
};

export const wordpressOrderStatus = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // 👉 Handle order delivered event
    if (data.event_type === "order_delivered") {
      if (data.orderId) {
        const result = await OrderModel.findOneAndUpdate(
          { orderId: data.orderId },
          { orderStatus: "DELIVERED" },
          { new: true }
        );
        console.log("Delivered order updated:", result);
      }

      // 👉 Handle order cancelled event
    } else if (data.event_type === "order_cancelled") {
      if (data.orderId) {
        const result = await OrderModel.findOneAndUpdate(
          { orderId: data.orderId },
          { orderStatus: "CANCELLED" },
          { new: true }
        );
        console.log("Order cancelled:", result);
      }

      // 👉 Handle order refunded event
    } else if (data.event_type === "order_refunded") {
      if (data.orderId) {
        const result = await OrderModel.findOneAndUpdate(
          { orderId: data.orderId },
          { orderStatus: "RETURNED" },
          { new: true }
        );
        console.log("Order RETURNED:", result);
      }
    }
    // Respond with success regardless of event type
    res.status(200).json({ success: true });
  } catch (error: any) {
    // 🔥 Catch any runtime errors and return 500
    console.error("Error in shopifyOrderStatus:", error.message || error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const wordpressVisitEvent = async (req: Request, res: Response) => {
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