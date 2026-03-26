import { Response } from "express";
import sendApiResponse from "../../common";
import { WORDPRESS_URL } from "../../config";
import { ChannelModel, ProductModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";

export const getWordpressProductList = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { _id: vendorId } = req.user;

    const channel = await ChannelModel.findOne({
      vendorId: vendorId,
      channelType: "wordpress",
    });

    const vendorProductList = await ProductModel.find({
      vendorId,
      channelName: "wordpress",
    }).select("channelProductId");

    if (!channel) {
      return sendApiResponse(res, 400, "Channel not found");
    }

    const url =
      WORDPRESS_URL +
      `/wp-json/crm-integration/products?token=${channel.channelConfig.token}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }
    // 1. Initialize the Controller
    const controller = new AbortController();

    // 2. Set a 1-minute (60,000ms) timer
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000);
    const response = await fetch(url, {
      method: "GET",
      headers,
      // This 'signal' is what controls the cancellation
      signal: controller.signal,
    });

    // 3. Clear the timer immediately once the server responds
    clearTimeout(timeoutId);

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


export const getWordpressProductDetails = async (
  req: AuthRequest,
  res: Response
) => {
  const { _id: vendorId } = req.user;
  const { productId } = req.query;

  try {
    const channel = await ChannelModel.findOne({
      vendorId: vendorId,
      channelType: "wordpress",
    });

    if (!channel) {
      return sendApiResponse(res, 400, "Channel not found");
    }

    const url =
      WORDPRESS_URL +
      `/wp-json/crm-integration/products/${productId}?token=${channel.channelConfig.token}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    // 1. Initialize the Controller
    const controller = new AbortController();

    // 2. Set a 1-minute (60,000ms) timer
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000);

    const response = await fetch(url, {
      method: "GET",
      headers,
      // This 'signal' is what controls the cancellation
      signal: controller.signal,
    });
    // 3. Clear the timer immediately once the server responds
    clearTimeout(timeoutId);
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
