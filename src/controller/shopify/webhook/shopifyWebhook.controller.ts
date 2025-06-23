import { Request, Response } from "express";
import {
  CollaborationModel,
  CreatorModel,
  ImpressionModel,
  OrderModel,
  ProductModel,
  VendorModel,
} from "../../../database/model";

const attributedOrder = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    // console.log("order data", data);
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

    // await deductCommotion(vendor?.accountId.toString(), calculatedCommission);
    // await addCommotion(
    //   creator?.accountId.toString(),
    //   calculatedCommission,
    //   true
    // );

    return order;
  } catch (error: any) {
    console.error("Error in attributedOrder:", error.message || error);
    return null;
  }
};

const shopifyOrderStatus = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // 👉 Handle order delivered event
    if (data.event_type === "order_delivered") {
      // Extract all delivered order IDs from the fulfillments array
      const deliveredOrders = data?.all_data?.fulfillments.map(
        (fulfillment: any) => fulfillment?.orderId?.order_id
      ).filter(Boolean); // Ensure only valid IDs are included

      if (deliveredOrders?.length) {
        // ✅ Update all matching orders to status DELIVERED
        const result = await OrderModel.updateMany(
          { orderId: { $in: deliveredOrders } },
          { $set: { orderStatus: "DELIVERED" } }
        );
        console.log("Delivered orders updated:", result);
      }

    // 👉 Handle order cancelled event
    } else if (data.event_type === "order_cancelled") {
      // Extract the cancelled order ID
      const cancelledOrderId = data?.data?.id;

      if (cancelledOrderId) {
        // ✅ Update the specific order to status CANCELLED
        const result = await OrderModel.findOneAndUpdate(
          { orderId: cancelledOrderId },
          { $set: { orderStatus: "CANCELLED" } },
          { new: true } // Return updated document
        );
        console.log("Order cancelled:", result);
      }

    // 👉 Handle order refunded event
    } else if (data.event_type === "order_refunded") {
      // Extract all refunded order IDs from the transactions array
      const refundedOrders = data?.all_data?.transactions?.map(
        (transaction: any) => transaction?.order_id
      ).filter(Boolean);

      if (refundedOrders?.length) {
        // ✅ Update all matching orders to status RETURNED
        const result = await OrderModel.updateMany(
          { orderId: { $in: refundedOrders } },
          { $set: { orderStatus: "RETURNED" } }
        );
        console.log("Refunded orders updated:", result);
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
      channel: "shopify",
    });

    return newImpression;
  } catch (error: any) {
    console.error("Error in shopifyVisitEvent:", error.message || error);
    return null;
  }
};

export { attributedOrder, shopifyVisitEvent, shopifyOrderStatus };
