import { Response } from "express";
import sendApiResponse from "../../common";
import { ChannelModel, VendorModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import { SHOPIFY_API_KEY, SHOPIFY_URL } from "../../config";

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
      const updatedVendor = await VendorModel.findByIdAndUpdate(
        vendorId,
        { $set: { completed_step: 3 } },
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
    });

    if (!channel) {
      return sendApiResponse(res, 400, "Channel not found");
    }

    const url = SHOPIFY_URL + `/crm/products?shop_url=${channel.channelConfig.domain}&page=${page}&limit=${limit}`;
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
      return sendApiResponse(res, 200, "Products fetched successfully", {
        list: data.products,
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
    });

    if (!channel) {
      return sendApiResponse(res, 400, "Channel not found");
    }

    const url =
      SHOPIFY_URL +
      `/crm/products/${productId}?shop_url=quickstart-add36e33.myshopify.com`;
    // const url = SHOPIFY_URL + `/crm/products/${productId}?shop_url=${channel.channelConfig.domain}`;
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
