import { Request, Response } from "express";
import {
  CollaborationModel,
  CreatorModel,
  ImpressionModel,
  OrderModel,
  ProductModel,
  VendorModel,
} from "../../database/model";
import {
  blockCommission,
  releaseBlockedToMain,
  releaseMainToBlocked,
  removeBlockedCommission,
} from "../../common/wallet/walletTransaction";
import mongoose from "mongoose";

export const wordPressOrderWebhook = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    // -------------------------------
    // 1. Validate request payload
    // -------------------------------
    const data = req.body;
    if (!data) return res.status(400).json({ error: "Empty webhook payload" });

    const orderId = data.orderId;
    const orderAmount = parseFloat(data.totalAmount || "0");
    const orderDate = data?.eventTimestamp;

    if (!orderId || !orderAmount || !orderDate) {
      throw new Error("Missing required order data from WordPress webhook.");
    }

    // -------------------------------
    // 2. Validate affiliate / collaboration ID
    // -------------------------------
    const affiliateId = data.crmAffiliateId;
    if (!affiliateId) {
      throw new Error("Missing affiliateId in attribution data.");
    }

    const collaborationId = affiliateId;
    const channel = "wordpress";

    // Start DB transaction
    session.startTransaction();

    // -------------------------------
    // 3. Get collaboration details
    // -------------------------------
    const collaboration = await CollaborationModel.findById(
      collaborationId
    ).session(session);
    if (!collaboration) {
      throw new Error(`Collaboration with ID ${collaborationId} not found.`);
    }

    // -------------------------------
    // 4. Get vendor & creator accounts
    // -------------------------------
    const vendor = await VendorModel.findById(collaboration.vendorId)
      .select("accountId")
      .session(session);

    const creator = await CreatorModel.findById(collaboration.creatorId)
      .select("accountId")
      .session(session);

    // -------------------------------
    // 5. Get all products from webhook line items
    // -------------------------------
    const collabProductIds = data.lineItems?.map((item: any) =>
      String(item.productId)
    );

    const products = await ProductModel.find({
      channelProductId: { $in: collabProductIds },
      vendorId: vendor?._id,
    })
      .select("_id channelProductId")
      .session(session);

    // -------------------------------
    // 6. Find active collaborations for those products
    // -------------------------------
    const collaborations = await CollaborationModel.find({
      creatorId: creator?._id,
      collaborationStatus: "ACTIVE",
      productId: { $in: products?.map((el) => el._id) },
    }).lean();

    // Array to collect orders for bulk insert
    const ordersToCreate: any[] = [];

    // -------------------------------
    // 7. Loop through collaborations and process matching items
    // -------------------------------
    for (const collab of collaborations) {
      // Match product to collaboration
      const matchedProduct = products.find(
        (p) => p._id.toString() === collab.productId.toString()
      );
      if (!matchedProduct) continue;

      // Find matching item from webhook data
      const matchingItem = data.lineItems?.find(
        (item: any) =>
          String(item.productId) === String(matchedProduct.channelProductId)
      );
      if (!matchingItem) continue;

      // -------------------------------
      // 8. Calculate commission for matched item
      // -------------------------------
      const noOfItems = matchingItem.quantity || 1;
      const individualPrice = matchingItem.price / noOfItems;

      const calculatedCommission =
        (collab.commissionType === "PERCENTAGE"
          ? individualPrice * (collab.commissionValue / 100)
          : collab.commissionValue) * noOfItems;

      // -------------------------------
      // 9. Wallet updates for vendor & creator
      // -------------------------------
      if (vendor && calculatedCommission > 0) {
        await releaseMainToBlocked(
          vendor.accountId.toString(),
          vendor._id.toString(),
          calculatedCommission,
          session
        );
      }

      if (creator && calculatedCommission > 0) {
        await blockCommission(
          creator.accountId.toString(),
          calculatedCommission,
          session
        );
      }

      // -------------------------------
      // 10. Prepare order object for DB insert
      // -------------------------------
      ordersToCreate.push({
        orderId,
        orderAmount: individualPrice * noOfItems,
        orderDate,
        collaborationId: collab._id,
        channel,
        productId: matchedProduct._id,
        channelProductId: matchedProduct.channelProductId,
        commission: calculatedCommission,
        orderStatus: "PENDING",
        quantity: noOfItems,
      });
    }

    // -------------------------------
    // 11. Save all orders in bulk
    // -------------------------------
    if (ordersToCreate.length > 0) {
      await OrderModel.insertMany(ordersToCreate, { session });
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log(
      "Order stored and wallets updated successfully:",
      ordersToCreate
    );

    return res.status(200).json({ success: true, order: ordersToCreate });
  } catch (e: any) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();

    console.error("Error in wordPressOrderWebhook:", e.message || e);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const wordpressOrderStatus = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const data = req.body;
    const { event_type } = data;
    if (!data) return res.status(400).json({ error: "Empty webhook payload" });

    const orderId = data.orderId;
    const orderAmount = parseFloat(data.totalAmount || "0");
    const orderDate = data?.eventTimestamp;

    if (!orderId || !orderAmount || !orderDate) {
      throw new Error("Missing required order data from WordPress webhook.");
    }

    const affiliateId = data.crmAffiliateId;
    if (!affiliateId) {
      throw new Error("Missing affiliateId in attribution data.");
    }

    const collaborationId = affiliateId;
    const channel = "wordpress";

    session.startTransaction();

    // Get main collaboration
    const collaboration = await CollaborationModel.findById(
      collaborationId
    ).session(session);
    if (!collaboration) {
      throw new Error(`Collaboration with ID ${collaborationId} not found.`);
    }

    const vendor = await VendorModel.findById(collaboration.vendorId)
      .select("accountId")
      .session(session);
    const creator = await CreatorModel.findById(collaboration.creatorId)
      .select("accountId")
      .session(session);

    const collabProductIds = data.lineItems?.map((item: any) =>
      String(item.productId)
    );
    const products = await ProductModel.find({
      channelProductId: { $in: collabProductIds },
      vendorId: vendor?._id,
    }).select("_id channelProductId blockedDays");

    const collaborations = await CollaborationModel.find({
      creatorId: creator?._id,
      collaborationStatus: "ACTIVE",
      productId: { $in: products?.map((el) => el._id) },
    }).lean();

    for (const collab of collaborations) {
      const matchedProduct = products.find(
        (p) => p._id.toString() === collab.productId.toString()
      );
      if (!matchedProduct) continue;

      const matchingItem = data.lineItems?.find(
        (item: any) =>
          String(item.productId) === String(matchedProduct.channelProductId)
      );
      if (!matchingItem) continue;

      const noOfItems = matchingItem.quantity || 1;
      const individualPrice = matchingItem.price / noOfItems;

      const calculatedCommission =
        (collab.commissionType === "PERCENTAGE"
          ? individualPrice * (collab.commissionValue / 100)
          : collab.commissionValue) * noOfItems;

      // Find matching order in DB
      const order = await OrderModel.findOne({
        orderId,
        status: { $ne: "SETTLED" }, // Only consider orders that are not already SETTLED
        productId: matchedProduct._id,
        collaborationId: collab._id,
      }).session(session);

      if (!order) continue;

      if (event_type === "order_delivered") {
        // Calculate blockedUntil date
        let blockedUntil: Date | undefined = undefined;
        if (
          matchedProduct.blockedDays &&
          typeof matchedProduct.blockedDays === "number"
        ) {
          const now = new Date();
          blockedUntil = new Date(
            now.getTime() + matchedProduct.blockedDays * 24 * 60 * 60 * 1000
          );
        }

        await OrderModel.updateOne(
          { _id: order._id },
          {
            $set: {
              orderStatus: "DELIVERED",
              ...(blockedUntil ? { blockedUntil } : {}),
            },
          },
          { session }
        );
      } else if (
        event_type === "order_cancelled" ||
        event_type === "order_refunded"
      ) {
        const refundQty = matchingItem.quantity || 0; // refunded qty from webhook
        const remainingQty = order.quantity - refundQty;

        const refundCommission =
          (collab.commissionType === "PERCENTAGE"
            ? individualPrice * (collab.commissionValue / 100)
            : collab.commissionValue) * refundQty;

        // Reverse only for refunded qty
        if (vendor && refundCommission > 0) {
          await releaseBlockedToMain(
            vendor.accountId.toString(),
            refundCommission,
            session
          );
        }
        if (creator && refundCommission > 0) {
          await removeBlockedCommission(
            creator.accountId.toString(),
            refundCommission,
            session
          );
        }


        // Update order record
        await OrderModel.updateOne(
          { _id: order._id },
          {
            $set: {
              quantity: remainingQty,
              orderAmount: individualPrice * remainingQty,
              orderStatus:
                remainingQty > 0
                  ? order?.orderStatus
                  : event_type === "order_cancelled"
                    ? "CANCELLED"
                    : "REFUNDED",
            },
          },
          { session }
        );
      }
    }

    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({ success: true });
  } catch (e: any) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in wordpressOrderStatus:", e?.message || e);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const wordpressOrderStatus1 = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const { event_type, orderId, crmAffiliateId, lineItems } = req.body;
    console.log("object----", orderId, event_type);
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    session.startTransaction();

    // Validate collaboration
    const collaboration = await CollaborationModel.findById(
      crmAffiliateId
    ).session(session);
    if (!collaboration) {
      throw new Error(`Collaboration with ID ${crmAffiliateId} not found.`);
    }

    const collabProductIds = lineItems?.map((item: any) => item.productId);
    const productIds = ProductModel.find({
      channelName: { $in: collabProductIds },
    }).select("_id");
    // Fetch account IDs for wallet transactions
    const vendor = await VendorModel.findById(collaboration.vendorId)
      .select("accountId")
      .session(session);
    const creator = await CreatorModel.findById(collaboration.creatorId)
      .select("accountId")
      .session(session);

    if (!vendor?.accountId || !creator?.accountId) {
      throw new Error("Missing account ID for vendor or creator");
    }

    let updatedStatus = "";

    if (event_type === "order_delivered") {
      const orders = await OrderModel.find({
        orderId,
        productId: { $in: productIds },
      }).session(session);
      if (!orders || orders.length === 0) {
        throw new Error(`Order not found for orderId: ${orderId}`);
      }
      for (const order of orders) {
        const product = await ProductModel.findById(order.productId)
          .select("blockedDays")
          .lean();

        let blockedUntil: Date | undefined = undefined;

        if (product?.blockedDays && typeof product.blockedDays === "number") {
          const now = new Date();
          blockedUntil = new Date(
            now.getTime() + product.blockedDays * 24 * 60 * 60 * 1000
          );
        }

        await OrderModel.updateOne(
          { _id: order._id },
          {
            $set: {
              orderStatus: "DELIVERED",
              ...(blockedUntil ? { blockedUntil } : {}),
            },
          },
          { session }
        );
      }
      console.log(`✅ Order ${orderId} marked as DELIVERED`);
    } else if (event_type === "order_cancelled") {
      updatedStatus = "CANCELLED";
    } else if (event_type === "order_refunded") {
      updatedStatus = "RETURNED";
    }

    if (updatedStatus) {
      const result: any = await OrderModel.findOneAndUpdate(
        { orderId },
        { orderStatus: updatedStatus },
        { new: true, session }
      );

      if (result && result.commission > 0) {
        const vendorId = vendor.accountId.toString();
        const creatorId = creator.accountId.toString();

        if (event_type === "order_delivered") {
          // await removeBlockedCommission(vendorId, result.commission, session);
          // await releaseBlockedToMain(creatorId, result.commission, session);
        } else if (
          event_type === "order_cancelled" ||
          event_type === "order_refunded"
        ) {
          await releaseBlockedToMain(vendorId, result.commission, session);
          await removeBlockedCommission(creatorId, result.commission, session);
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

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
      throw new Error(`Collaboration with ID ${data.utm_link_id} not found.`);
    }
    const newImpression = await ImpressionModel.create({
      collaborationId: collaboration._id,
      impression: "VISIT",
      channel: "wordpress",
    });

    return newImpression;
  } catch (error: any) {
    console.error("Error in shopifyVisitEvent:", error.message || error);
    return null;
  }
};
