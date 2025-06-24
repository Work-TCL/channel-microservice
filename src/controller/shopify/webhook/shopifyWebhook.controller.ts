import { Request, Response } from "express";
import {
  CollaborationModel,
  CreatorModel,
  ImpressionModel,
  OrderModel,
  ProductModel,
  VendorModel,
} from "../../../database/model";
import {
  blockCommission,
  releaseBlockedToMain,
  releaseMainToBlocked,
  removeBlockedCommission,
} from "../../../common/wallet/walletTransaction";
import mongoose from "mongoose";

// Shopify order attribution webhook handler
const attributedOrder = async (req: Request, res: Response) => {
  const session = await mongoose.startSession(); // Start DB session for transaction

  try {
    const data = req.body;

    // Extract required order fields
    const orderId = data.order_data?.id;
    const orderAmount = parseFloat(data.order_data?.total_price || "0");
    const orderDate = data.order_data?.created_at;

    // Validate order data
    if (!orderId || !orderAmount || !orderDate) {
      throw new Error("Missing required order data from Shopify webhook.");
    }

    // Extract and validate affiliate ID from attribution payload
    const affiliateId = data.attribution_data?.affiliateId;
    if (!affiliateId || !affiliateId.includes("-")) {
      throw new Error("Invalid or missing affiliateId in attribution data.");
    }

    // Extract collaborationId from affiliateId (format: prefix-<collaborationId>)
    const collaborationId = affiliateId.split("-")[1];
    const channel = "shopify";

    await session.startTransaction(); // Begin MongoDB transaction

    // Find the related collaboration using the extracted ID
    const collaboration = await CollaborationModel.findById(collaborationId).session(session);
    if (!collaboration) {
      throw new Error(`Collaboration with ID ${collaborationId} not found.`);
    }

    // Find the associated product from the collaboration
    const product = await ProductModel.findById(collaboration.productId).session(session);
    if (!product) {
      throw new Error(`Product with ID ${collaboration.productId} not found.`);
    }

    // Calculate commission based on collaboration rules
    const calculatedCommission =
      collaboration.commissionType === "PERCENTAGE"
        ? orderAmount * (collaboration.commissionValue / 100)
        : collaboration.commissionValue;

    // Create and store the order in your database
    const [order] = await OrderModel.create(
      [
        {
          orderId,
          orderAmount,
          orderDate,
          collaborationId,
          channel,
          productId: product._id,
          channelProductId: product.channelProductId,
          commission: calculatedCommission,
          orderStatus: "PENDING",
        },
      ],
      { session }
    );

    // Fetch vendor and creator accounts for wallet updates
    const vendor = await VendorModel.findById(collaboration.vendorId).select("accountId").session(session);
    const creator = await CreatorModel.findById(collaboration.creatorId).select("accountId").session(session);

    // Deduct commission from vendor's main balance into blocked
    if (vendor && calculatedCommission > 0) {
      await releaseMainToBlocked(vendor.accountId.toString(), calculatedCommission, session);
    }

    // Block commission into creator's wallet
    if (creator && calculatedCommission > 0) {
      await blockCommission(creator.accountId.toString(), calculatedCommission, session);
    }

    await session.commitTransaction(); // Commit DB changes
    session.endSession(); // End session

    console.log("Order stored and wallets updated successfully:", order);
    return res.status(200).json({ success: true, order });
  } catch (error: any) {
    await session.abortTransaction(); // Rollback on failure
    session.endSession();

    console.error("Error in attributedOrder:", error.message || error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


const shopifyOrderStatus = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const data = req.body;
    await session.startTransaction(); // Start MongoDB transaction

    // 👉 Handle "order_delivered" event
    if (data.event_type === "order_delivered") {
      const deliveredOrders = data?.all_data?.fulfillments
        .map((fulfillment: any) => fulfillment?.orderId?.order_id)
        .filter(Boolean);

      if (deliveredOrders?.length) {
        // ✅ Update status for all delivered orders
        await OrderModel.updateMany(
          { orderId: { $in: deliveredOrders } },
          { $set: { orderStatus: "DELIVERED" } },
          { session }
        );

        // 🔄 Process commission release for each delivered order
        for (const orderId of deliveredOrders) {
          const order: any = await OrderModel.findOne({ orderId }).session(session);
          if (!order) continue;

          const collaboration = await CollaborationModel.findById(order.collaborationId).session(session);
          if (!collaboration) continue;

          const vendor = await VendorModel.findById(collaboration.vendorId).select("accountId").session(session);
          const creator = await CreatorModel.findById(collaboration.creatorId).select("accountId").session(session);

          if (!vendor?.accountId || !creator?.accountId) {
            throw new Error("Missing account ID for vendor or creator");
          }

          if (order.commission > 0) {
            await removeBlockedCommission(vendor.accountId.toString(), order.commission, session);
            await releaseBlockedToMain(creator.accountId.toString(), order.commission, session);
          }
        }
      }
    }

    // 👉 Handle "order_cancelled" event
    else if (data.event_type === "order_cancelled") {
      const cancelledOrderId = data?.data?.id;

      if (cancelledOrderId) {
        const order: any = await OrderModel.findOne({ orderId: cancelledOrderId }).session(session);
        if (!order) throw new Error("Order not found");

        await OrderModel.updateOne(
          { orderId: cancelledOrderId },
          { $set: { orderStatus: "CANCELLED" } },
          { session }
        );

        const collaboration = await CollaborationModel.findById(order.collaborationId).session(session);
        const vendor = await VendorModel.findById(collaboration?.vendorId).select("accountId").session(session);
        const creator = await CreatorModel.findById(collaboration?.creatorId).select("accountId").session(session);

        if (!vendor?.accountId || !creator?.accountId) {
          throw new Error("Missing account ID for vendor or creator");
        }

        if (order.commission > 0) {
          await releaseBlockedToMain(vendor.accountId.toString(), order.commission, session);
          await removeBlockedCommission(creator.accountId.toString(), order.commission, session);
        }
      }
    }

    // 👉 Handle "order_refunded" event
    else if (data.event_type === "order_refunded") {
      const refundedOrders = data?.all_data?.transactions
        ?.map((transaction: any) => transaction?.order_id)
        .filter(Boolean);

      if (refundedOrders?.length) {
        await OrderModel.updateMany(
          { orderId: { $in: refundedOrders } },
          { $set: { orderStatus: "RETURNED" } },
          { session }
        );

        // 🔄 Process commission reversal for each refunded order
        for (const orderId of refundedOrders) {
          const order: any = await OrderModel.findOne({ orderId }).session(session);
          if (!order) continue;

          const collaboration = await CollaborationModel.findById(order.collaborationId).session(session);
          if (!collaboration) continue;

          const vendor = await VendorModel.findById(collaboration.vendorId).select("accountId").session(session);
          const creator = await CreatorModel.findById(collaboration.creatorId).select("accountId").session(session);

          if (!vendor?.accountId || !creator?.accountId) {
            throw new Error("Missing account ID for vendor or creator");
          }

          if (order.commission > 0) {
            await releaseBlockedToMain(vendor.accountId.toString(), order.commission, session);
            await removeBlockedCommission(creator.accountId.toString(), order.commission, session);
          }
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error in shopifyOrderStatus:", error.message || error);
    return res.status(500).json({ error: "Internal server error" });
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
