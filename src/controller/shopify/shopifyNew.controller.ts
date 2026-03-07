import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  AccountModel,
  ChannelModel,
  ProductModel,
  VendorModel,
} from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import { SHOPIFY_API_KEY, SHOPIFY_URL } from "../../config";
import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";

export const generateConnectionLink = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { _id: vendorId } = req.user;
    // const { domain } = req.body;
    // if (!domain) return sendApiResponse(res, 400, "Domain is required");

    const vendor = await VendorModel.findById(vendorId)
      .select("accountId")
      .lean();
    if (!vendor) return sendApiResponse(res, 400, "Vendor not found");

    const accountId = vendor.accountId;

    const payload = { accountId, vendorId };
    const token = jwt.sign(payload, "SHOPIFY", { expiresIn: "1d" });
    return sendApiResponse(res, 200, "Key generated successfully", { key: token });
  } catch (e) {
    console.log("error while generating connection key", e);
    return sendApiResponse(res, 400, "Something went wrong", e);
  }
};

export const disconnectShopifyStore = async (req: AuthRequest, res: Response) => {
  try {
    const { uniqueId, domain } = req.body;

    if (!domain) {
      return sendApiResponse(res, 400, "Domain is required");
    }

    const channel = await ChannelModel.findOne({
      // channelId: uniqueId,
      channelType: "shopify",
      "channelConfig.domain": domain,
    });
    console.log("channel", channel);
    if (!channel) return sendApiResponse(res, 400, "Channel not found");

    // Delete Shopify channel(s) for this vendor by domain
    const deletedChannels = await ChannelModel.deleteMany({
      // vendorId: channel.vendorId,
      channelType: "shopify",
      "channelConfig.domain": domain,
    });
    console.log("deletedChannels", deletedChannels);
    const vendor = await VendorModel.findById(channel.vendorId);
    if (!vendor) return sendApiResponse(res, 400, "Vendor not found");

    vendor.completed_step = 0;
    await vendor.save();

    const channels = await ChannelModel.find({ vendorId: channel.vendorId });

    console.log("channels", channels);
    return sendApiResponse(res, 200, "Shop disconnected successfully");
  } catch (e) {
    console.log("error while disconnecting shopify store", e);
    return sendApiResponse(res, 400, "Something went wrong", e);
  }
};

export const verifyConnectionKey = async (req: Request, res: Response) => {
  try {
    const { token, uniqueId, shopUrl } = req.body;

    if (!token) return sendApiResponse(res, 400, "Token is required");
    if (!uniqueId || !shopUrl) {
      return sendApiResponse(res, 400, "uniqueId and shopUrl are required");
    }

    let decoded: { accountId: string; vendorId: string; };

    try {
      decoded = jwt.verify(token, "SHOPIFY") as typeof decoded;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return sendApiResponse(res, 401, "Token has expired. Please request a new connection link.");
      } else if (err instanceof JsonWebTokenError) {
        return sendApiResponse(res, 401, "Invalid token. Authentication failed.");
      } else {
        console.error("Unexpected token error:", err);
        return sendApiResponse(res, 500, "Token verification failed due to server error.");
      }
    }

    const vendor = await VendorModel.findById(decoded.vendorId);
    if (!vendor) return sendApiResponse(res, 400, "Vendor not found");

    if (vendor.accountId.toString() !== decoded.accountId.toString()) {
      return sendApiResponse(res, 400, "Invalid key - account mismatch");
    }

    // if (decoded.domain !== shopUrl) {
    //   return sendApiResponse(res, 400, "Invalid key - domain mismatch");
    // }

    const existingChannel = await ChannelModel.findOne({
      channelType: "shopify",
      vendorId: vendor._id,
    });

    if (existingChannel) {
      await ChannelModel.deleteOne({ _id: existingChannel._id });
    }

    const channel = await ChannelModel.create({
      channelId: uniqueId,
      channelType: "shopify",
      channelStatus: "active",
      vendorId: vendor._id,
      channelConfig: { domain: shopUrl },
    });

    vendor.completed_step = 3;
    if (vendor.status === "IN_PROGRESS") {
      // vendor.status = "PENDING_APPROVAL";
      vendor.status = "APPROVED";
    }

    await vendor.save();

    return sendApiResponse(res, 200, "Shop connected successfully", {
      channel: channel.toObject(),
      vendor: vendor.toObject(),
    });
  } catch (e) {
    console.error("Unexpected server error:", e);
    return sendApiResponse(res, 500, "An unexpected error occurred.");
  }
};

export const connectShopifyStore = async (req: AuthRequest, res: Response) => {
  const { uniqueId, shopUrl } = req.body;
  const { _id: vendorId } = req.user;

  try {
    if (!uniqueId || !shopUrl) {
      return sendApiResponse(res, 400, "uniqueId and shopUrl is required");
    }

    // check if shopify store already not exists for this vendor
    const existingChannel = await ChannelModel.findOne({
      channelType: "shopify",
      vendorId: vendorId,
    });
    if (existingChannel) {
      return sendApiResponse(
        res,
        200,
        "Shop already connected",
        existingChannel
      );
    }

    const url = SHOPIFY_URL + "/crm/connect";
    const apiKey = SHOPIFY_API_KEY;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["x-crm-api-key"] = apiKey;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        uniqueId: uniqueId,
        shopUrl: shopUrl,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`HTTP Error: ${data.error}`);
    }

    if (data.status === "already_connected") {
      return sendApiResponse(
        res,
        404,
        "Shop already connected with platform",
        data
      );
    }

    if (data.status === "connected") {
      // create channel
      const channel = await ChannelModel.create({
        channelId: uniqueId,
        channelType: "shopify",
        channelStatus: "active",
        vendorId: vendorId,
        channelConfig: {
          domain: shopUrl,
        },
      });
      await channel.save();
      const vendor = await VendorModel.findById(vendorId);

      if (!vendor) {
        throw new Error("Vendor not found");
      }

      const updateFields: any = { completed_step: 3 };

      if (vendor.status === "IN_PROGRESS") {
        updateFields.status = "PENDING_APPROVAL";
      }

      const updatedVendor = await VendorModel.findByIdAndUpdate(
        vendorId,
        { $set: updateFields },
        { new: true }
      );
      return sendApiResponse(res, 200, "Shop connected successfully", {
        ...channel.toObject(),
        ...updatedVendor?.toObject(),
      });
    }

    return sendApiResponse(res, 400, "Something went wrong", null);
  } catch (e: any) {
    console.log("error while connecting shopify store", e);
    return sendApiResponse(res, 400, e?.message || "Something went wrong", e);
  }
};

export const getShopifyProductList = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { _id: vendorId } = req.user;

    const channel = await ChannelModel.findOne({
      vendorId: vendorId,
      channelType: "shopify",
    });

    const vendorProductList = await ProductModel.find({
      vendorId,
      channelName: "shopify",
    }).select("channelProductId");

    if (!channel) {
      return sendApiResponse(res, 400, "Channel not found");
    }

    const url =
      SHOPIFY_URL +
      `/crm/products?shop_url=${channel.channelConfig.domain}&page=${page}&limit=${limit}`;
    // const url =
    //   SHOPIFY_URL +
    //   `/crm/products?shop_url=quickstart-add36e33.myshopify.com&page=${page}&limit=${limit}`;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    const apiKey = SHOPIFY_API_KEY;

    if (apiKey) {
      headers["x-crm-api-key"] = apiKey;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    if (data?.products?.length > 0) {
      const channelProductIds = vendorProductList.map(
        (item) => item.channelProductId
      );
      const result = data.products.map((item: any) => {
        return {
          ...item,
          alreadyAdded: channelProductIds.includes(item.id.toString()),
        };
      });
      return sendApiResponse(res, 200, "Products fetched successfully", {
        list: result,
        count: data.pagination.totalProducts,
      });
    }

    return sendApiResponse(res, 200, "No products found", {
      list: [],
      count: 0,
    });
  } catch (e) {
    console.log("error while fetching products", e);
    return sendApiResponse(res, 400, "Something went wrong", e);
  }
};

export const getShopifyProductDetails = async (
  req: AuthRequest,
  res: Response
) => {
  const { _id: vendorId } = req.user;
  const { productId } = req.query;

  try {
    const channel = await ChannelModel.findOne({
      vendorId: vendorId,
      channelType: "shopify",
    });

    if (!channel) {
      return sendApiResponse(res, 400, "Channel not found");
    }

    // const url =
    // SHOPIFY_URL +
    // `/crm/products/${productId}?shop_url=quickstart-add36e33.myshopify.com`;
    const url =
      SHOPIFY_URL +
      `/crm/products/${productId}?shop_url=${channel.channelConfig.domain}`;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    const apiKey = SHOPIFY_API_KEY;

    if (apiKey) {
      headers["x-crm-api-key"] = apiKey;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    if (data) {
      return sendApiResponse(
        res,
        200,
        "Product details fetched successfully",
        data
      );
    }

    return sendApiResponse(res, 200, "Product not found", null);
  } catch (e) {
    console.log("error while fetching product details", e);
    return sendApiResponse(res, 400, "Something went wrong", e);
  }
};


export const updateShopifyPriceEvery2hr = async () => {
  try {
    const shopifyProductsList = await ProductModel.aggregate([
      {
        $match: {
          channelName: "shopify",
          status: "ACTIVE"
        }
      },
      // Join with Vendor
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor"
        }
      },
      { $unwind: "$vendor" },
      // Join with Channel (to get shop_url)
      {
        $lookup: {
          from: "channels",
          let: { vendorId: "$vendorId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$vendorId", "$$vendorId"] },
                    { $eq: ["$channelType", "shopify"] }
                  ]
                }
              }
            }
          ],
          as: "channel"
        }
      },
      { $unwind: "$channel" },
      // Only fetch non-deleted accounts
      {
        $lookup: {
          from: "accounts",
          localField: "vendor.accountId",
          foreignField: "_id",
          as: "account"
        }
      },
      { $unwind: "$account" },
      {
        $match: {
          "account.isDeleted": { $ne: true }
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          price: 1,
          vendorId: 1,
          channelProductId: 1,
          variants: 1,
          "channel.channelConfig.domain": 1
        }
      }
    ]);

    console.log(`Checking ${shopifyProductsList.length} active Shopify products for price updates...`);

    for (const product of shopifyProductsList) {
      const shopUrl = product.channel?.channelConfig?.domain;
      const productId = product.channelProductId;

      if (!shopUrl || !productId) continue;

      const url = `${SHOPIFY_URL}/crm/products/${productId}?shop_url=${shopUrl}`;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      const apiKey = SHOPIFY_API_KEY;
      if (apiKey) {
        headers["x-crm-api-key"] = apiKey;
      }


      try {
        const response = await fetch(url, {
          method: "GET",
          headers
        });

        if (!response.ok) {
          console.warn(`Failed to fetch Shopify product ${productId}: ${response.status}`);
          continue;
        }

        const responseData = await response.json();
        const productData = responseData;

        if (!productData) {
          console.warn(`No product data found for ${productId}`);
          continue;
        }

        const newPrice = productData.variants?.[0]?.price;

        // Build updated variants array
        const updatedVariants = productData.variants.map((item: any) => ({
          sku: item.sku,
          price: item.price,
          title: item.title
        }));

        const updatePayload: any = {
          price: newPrice,
          variants: updatedVariants
        };

        // Optional: Only update if price or variants changed
        const hasPriceChanged = product.price !== newPrice;
        const hasVariantsChanged = JSON.stringify(product.variants) !== JSON.stringify(updatedVariants);

        if (hasPriceChanged || hasVariantsChanged) {
          await ProductModel.updateOne(
            { _id: product._id },
            { $set: updatePayload }
          );

          console.log(`Updated product ${product._id} with new price and variants`);
        }
      } catch (err) {
        console.error(`Error updating product ${product._id}:`, err);
      }
    }

    console.log("Shopify price update cron job completed.");
  } catch (e) {
    console.error("Error in Shopify price update cron:", e);
  }
};
