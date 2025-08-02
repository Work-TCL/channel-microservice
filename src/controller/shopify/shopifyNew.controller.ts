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
import jwt from "jsonwebtoken";

export const generateConnectionLink = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { _id: vendorId } = req.user;
    const { domain } = req.body;
    if (!domain) return sendApiResponse(res, 400, "Domain is required");

    const vendor = await VendorModel.findById(vendorId)
      .select("accountId")
      .lean();
    if (!vendor) return sendApiResponse(res, 400, "Vendor not found");

    const accountId = vendor.accountId;

    const payload = { accountId, vendorId, domain };
    const token = jwt.sign(payload, "SHOPIFY", { expiresIn: "1d" });
    return sendApiResponse(res, 200, "Key generated successfully", { key: token , domain});
  } catch (e) {
    console.log("error while generating connection key", e);
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

    const decoded = jwt.verify(token, "SHOPIFY") as {
      accountId: string;
      vendorId: string;
      domain: string;
    };

    const vendor = await VendorModel.findById(decoded.vendorId);
    // console.log("vendor", vendor);
    if (!vendor) return sendApiResponse(res, 400, "Vendor not found");

    if (vendor.accountId.toString() !== decoded.accountId.toString()) {
      return sendApiResponse(res, 400, "Invalid key");
    }

    if(decoded.domain !== shopUrl) return sendApiResponse(res, 400, "Invalid key");
    
    const existingChannel = await ChannelModel.findOne({
      channelType: "shopify",
      vendorId: vendor._id,
    });

    if (existingChannel) return sendApiResponse(res, 400, "Shop already connected");

    const channel = await ChannelModel.create({
      channelId: uniqueId,
      channelType: "shopify",
      channelStatus: "active",
      vendorId: vendor._id,
      channelConfig: {
        domain: shopUrl,
      },
    });

    // Update vendor step and status
    vendor.completed_step = 3;
    if (vendor.status === "IN_PROGRESS") {
      vendor.status = "PENDING_APPROVAL";
    }

    await vendor.save();

    return sendApiResponse(res, 200, "Shop connected successfully", {
      channel: channel.toObject(),
      vendor: vendor.toObject(),
    });
  } catch (e) {
    console.error("Token verification failed", e);
    return sendApiResponse(res, 500, "Token verification failed");
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
