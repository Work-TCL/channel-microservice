import { Request, Response } from "express";
import sendApiResponse from "../../../../product-service/src/common";
import { ChannelModel, CollaborationModel, VendorProductModel } from "../../database/model";

export const getSalesFromShopify = async (req: Request, res: Response) => {
  try {
    console.log("sales data", req.body);
    return sendApiResponse(res, 200, "Sales data fetched successfully");
  } catch (error) {
    console.log("error", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

export const getShopifyCollaborationList = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;
    const { channelId } = req.query;

    if (!channelId) {
      return sendApiResponse(res, 400, "channelId is required in query params");
    }

    // Step 1: Get the Channel record
    const channel = await ChannelModel.find({
      channelId,
      channelType: 'shopify',
    }).select('vendorId');

    if (!channel) {
      return sendApiResponse(res, 404, "Shopify channel not found");
    }

    // Step 2: Get Shopify vendor products for this vendor
    const shopifyVendorProducts = await VendorProductModel.find({
      vendorId: channel?.length > 0 ? channel.map((c) => c.vendorId) : [],
      channelName: 'shopify',
    }).select('productId').lean();

    const shopifyProductIds = new Set(
      shopifyVendorProducts.map((vp) => vp.productId.toString())
    );

    if (shopifyProductIds.size === 0) {
      return sendApiResponse(res, 200, "No Shopify products found for this vendor", []);
    }

    // Step 3: Get collaborations where both agreed and product is Shopify
    const collaborations = await CollaborationModel.find({
      'negotiation.agreedByCreator': true,
      'negotiation.agreedByVendor': true,
      collaborationStatus: 'PENDING',
      productId: { $in: Array.from(shopifyProductIds) },
    })
      .skip(skip)
      .limit(limit)
      .populate([
        {
          path: 'creatorId',
          select: '_id user_name',
        },
        {
          path: 'productId',
          select: '_id channelProductId',
        },
      ])
      .lean();

    return sendApiResponse(res, 200, "Shopify collaborations fetched successfully", collaborations);
  } catch (error) {
    console.error("error", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};


export const acceptedShopifyCollaboration = async (req: Request, res: Response) => {
  try{
    const { collaborationId, status } = req.body;
    console.log("status",status, status === "ACTIVE")
    if(status !== "ACTIVE" && status !== "REJECTED"){
      return sendApiResponse(res, 400, "Invalid status");
    }

    const existing = await CollaborationModel.findById(collaborationId);
    if(!existing){
      return sendApiResponse(res, 404, "Collaboration not found");
    }
    if(existing.collaborationStatus === "ACTIVE"){
      return sendApiResponse(res, 400, "Collaboration is not pending, Collaboration is already activated");
    }

    const collaboration = await CollaborationModel.findByIdAndUpdate(collaborationId, {
      $set: {
        collaborationStatus: status,
      },
    }, { new: true });
    
    return sendApiResponse(res, 200, "Collaboration status updated successfully", collaboration);
  } catch(e) {
    console.log("error", e);
    return sendApiResponse(res, 500, "Internal server error");
  }
}
