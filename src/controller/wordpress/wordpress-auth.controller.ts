import { Response } from "express";
import { AuthRequest } from "../../types/authRequest";
import sendApiResponse from "../../common";
import { ChannelModel, VendorModel } from "../../database/model";
import { WORDPRESS_URL } from "../../config";

export const authorizeWordpress = async (req: AuthRequest, res: Response) => {
  const { uniqueId, shopUrl } = req.body;
  const { _id: vendorId } = req.user;

  try {
    if (!uniqueId || !shopUrl) {
      return sendApiResponse(res, 400, "uniqueId and shopUrl is required");
    }

    // check if shopify store already not exists for this vendor
    const existingChannel = await ChannelModel.findOne({
      channelType: "wordpress",
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

    const url = WORDPRESS_URL + "/wp-json/crm-integration/connect";
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
      method: "POST",
      headers,
      // This 'signal' is what controls the cancellation
      signal: controller.signal,
      body: JSON.stringify({
        uniqueId: uniqueId,
        shopUrl: shopUrl,
      }),
    });

    // 3. Clear the timer immediately once the server responds
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`HTTP Error: ${data.error}`);
    }
    console.log("WordPress response:", data);
    //   if (data.status) {
    //     return sendApiResponse(
    //       res,
    //       404,
    //       "Shop already connected with platform",
    //       data
    //     );
    //   }

    if (data.success) {
      // create channel
      const channel = await ChannelModel.create({
        channelId: uniqueId,
        channelType: "wordpress",
        channelStatus: "active",
        vendorId: vendorId,
        channelConfig: {
          domain: shopUrl,
          token: data.token,
        },
      });
      await channel.save();
      const vendor = await VendorModel.findById(vendorId);

      if (!vendor) {
        throw new Error("Vendor not found");
      }

      const updateFields: any = { completed_step: 3 };

      if (vendor.status === "IN_PROGRESS") {
        // updateFields.status = "PENDING_APPROVAL";
        updateFields.status = "APPROVED";
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
    console.log("error while authenticate wordpress:", e);
    return sendApiResponse(res, 400, e?.message || "Something went wrong", e);
  }
};
