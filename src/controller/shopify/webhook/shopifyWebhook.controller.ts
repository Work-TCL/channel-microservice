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
import mongoose, { ClientSession, SessionOperation } from "mongoose";

// Shopify order attribution webhook handler
const attributedOrder = async (req: Request, res: Response) => {
  const session = await mongoose.startSession(); // Start DB session for transaction

  try {
    // -------------------------------
    // 1. Validate request payload
    // -------------------------------
    const data = req.body.order_data;
    if (!data) return res.status(400).json({ error: "Empty webhook payload" });

    const orderId = data.id;
    const orderAmount = parseFloat(data.total_price || "0");
    const orderDate = data?.created_at;

    if (!orderId || !orderAmount || !orderDate) {
      throw new Error("Missing required order data from WordPress webhook.");
    }

    // -------------------------------
    // 2. Validate affiliate / collaboration ID
    // -------------------------------
    const affiliateId = req.body?.attribution_data?.affiliateId?.split("-")[1];
    if (!affiliateId) {
      throw new Error("Missing affiliateId in attribution data.");
    }

    const collaborationId = affiliateId;
    const channel = "shopify";

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
    const collabProductIds = data.line_items?.map((item: any) =>
      String(item.product_id)
    );

    const products = await ProductModel.find({
      channelProductId: { $in: collabProductIds },
      vendorId: vendor?._id,
    })
      .select("_id channelProductId")
      .session(session);
console.log("object",collabProductIds,products)
    // -------------------------------
    // 6. Find active collaborations for those products
    // -------------------------------
    const collaborations = await CollaborationModel.find({
      creatorId: creator?._id,
      collaborationStatus: "ACTIVE",
      productId: { $in: products?.map((el) => el._id) },
    }).lean();
console.log("collaboration", collaborations)
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
      const matchingItem = data.line_items?.find(
        (item: any) =>
          String(item.product_id) === String(matchedProduct.channelProductId)
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
  } catch (error: any) {
    await session.abortTransaction(); // Rollback on failure
    session.endSession();

    console.error("Error in attributedOrder:", error.message || error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

const shopifyOrderStatus = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const data = req.body.all_data;
    const { event_type } = req.body;
    if (!data) return res.status(400).json({ error: "Empty webhook payload" });
console.log("event_type",event_type)
    if (event_type === "order_delivered") {
      await handleOrderDelivery(req.body, session);
    } else if (event_type === "order_cancelled") {
      await handleCancelOrder(req.body, session);
    } else if (event_type === "order_refunded") {
      await handleRefundOrder(req.body, session);
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

async function handleOrderDelivery(data: any, session: ClientSession) {
  const orderId = data.all_data.id;

  if (!orderId) {
    throw new Error("Missing required order data from WordPress webhook.");
  }

  const affiliateId = data.attribution_data?.affiliateId?.split("-")[1];
  if (!affiliateId) {
    throw new Error("Missing affiliateId in attribution data.");
  }

  const collaborationId = affiliateId;
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

  const collabProductIds = data.all_data.line_items?.map((item: any) =>
    String(item.product_id)
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

    const matchingItem = data.all_data.line_items?.find(
      (item: any) =>
        String(item.product_id) === String(matchedProduct.channelProductId)
    );
    if (!matchingItem) continue;

    // Find matching order in DB
    const order = await OrderModel.findOne({
      orderId,
      productId: matchedProduct._id,
      collaborationId: collab._id,
    }).session(session);

    if (!order) continue;

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
  }
}

async function handleCancelOrder(data: any, session: ClientSession) {
  const orderId = data.all_data.id;

  if (!orderId) {
    throw new Error("Missing required order data from WordPress webhook.");
  }

  const affiliateId = data.attribution_data?.affiliateId?.split("-")[1];
  if (!affiliateId) {
    throw new Error("Missing affiliateId in attribution data.");
  }

  const collaborationId = affiliateId;
  const channel = "shopify";

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

  const collabProductIds = data.all_data.line_items?.map((item: any) =>
    String(item.product_id)
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

    const matchingItem = data.all_data.line_items?.find(
      (item: any) =>
        String(item.product_id) === String(matchedProduct.channelProductId)
    );
    if (!matchingItem) continue;

    const noOfItems = matchingItem.quantity || 1;
    const individualPrice = matchingItem.price / noOfItems;

    // Find matching order in DB
    const order = await OrderModel.findOne({
      orderId,
      productId: matchedProduct._id,
      collaborationId: collab._id,
    }).session(session);

    if (!order) continue;

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
          orderStatus: remainingQty > 0 ? order?.orderStatus : "CANCELLED",
        },
      },
      { session }
    );
  }
}

async function handleRefundOrder(data: any, session: ClientSession) {
  const orderId = data.all_data.order_id;

  if (!orderId) {
    throw new Error("Missing required order data from WordPress webhook.");
  }
console.log("object----", data.attribution_data)
  const affiliateId = data.attribution_data?.affiliateId?.split("-")[1];
  if (!affiliateId) {
    throw new Error("Missing affiliateId in attribution data.");
  }

  const collaborationId = affiliateId;
  const channel = "shopify";

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

  const collabProductIds = data.all_data.refund_line_items?.map((item: any) =>
    String(item.line_item.product_id)
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

    const matchingItem = data.all_data.refund_line_items?.find(
      (item: any) =>
        String(item.line_item.product_id) ===
        String(matchedProduct.channelProductId)
    );
    if (!matchingItem) continue;

    const noOfItems = matchingItem.line_item.quantity || 1;
    const individualPrice = matchingItem.line_item.price / noOfItems;

    // Find matching order in DB
    const order = await OrderModel.findOne({
      orderId,
      productId: matchedProduct._id,
      collaborationId: collab._id,
    }).session(session);

    if (!order) continue;

    const refundQty = matchingItem.line_item.quantity || 0; // refunded qty from webhook
    const remainingQty = order.quantity - refundQty;
    console.log("object-----",refundQty,remainingQty)
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
          orderStatus: remainingQty > 0 ? order?.orderStatus : "REFUNDED",
        },
      },
      { session }
    );
  }
}

export const releaseBlockedAmounts = async () => {
  try {
    console.log("hello");
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000);

    // 1. Fetch delivered orders with blockedUntil within past 32 days and already passed
    const deliveredOrders = await OrderModel.find({
      orderStatus: "DELIVERED",
      blockedUntil: {
        $exists: true,
        $gte: thirtyDaysAgo,
      },
    });

    const stillBlocked: any[] = [];
    const unblocked: any[] = [];

    for (const order of deliveredOrders) {
      const { blockedUntil, orderId, commission, collaborationId } = order;

      const currentTime = new Date();

      if (blockedUntil && new Date(blockedUntil) > currentTime) {
        stillBlocked.push(orderId);
        console.log(
          `🟡 Order ${orderId} is still blocked until ${blockedUntil}`
        );
        continue;
      }

      const collaboration = await CollaborationModel.findById(
        collaborationId
      ).lean();
      if (!collaboration) {
        console.warn(`⚠️ Collaboration not found for order ${orderId}`);
        continue;
      }

      const vendor = await VendorModel.findById(collaboration.vendorId)
        .select("accountId")
        .lean();
      const creator = await CreatorModel.findById(collaboration.creatorId)
        .select("accountId")
        .lean();

      if (!vendor?.accountId || !creator?.accountId) {
        console.warn(
          `⚠️ Missing account ID for vendor or creator in order ${orderId}`
        );
        continue;
      }

      if (commission && commission > 0) {
        await removeBlockedCommission(vendor.accountId.toString(), commission);
        await releaseBlockedToMain(creator.accountId.toString(), commission);
        console.log(`✅ Released ₹${commission} for Order ${orderId}`);

        // 🧹 Remove blockedUntil to avoid reprocessing
        await OrderModel.updateOne(
          { _id: order._id },
          { $unset: { blockedUntil: "" } }
        );
      }

      unblocked.push(orderId);
    }

    console.log(`🎯 Processed ${deliveredOrders.length} orders`);
    console.log(`🟢 Unblocked orders: ${unblocked.length}`);
    console.log(`🟡 Still blocked orders: ${stillBlocked.length}`);
  } catch (err: any) {
    console.error(
      "❌ Error in cron job for delivered orders:",
      err.message || err
    );
  }
};

export { attributedOrder, shopifyVisitEvent, shopifyOrderStatus };
