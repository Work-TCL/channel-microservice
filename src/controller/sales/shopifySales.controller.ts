import { Request, Response } from "express";
import sendApiResponse from "../../../../product-service/src/common";
import { ChannelModel, CollaborationModel } from "../../database/model";

export const getSalesFromShopify = async (req: Request, res: Response) => {
  try {
    console.log("sales data", req.body);
    return sendApiResponse(res, 200, "Sales data fetched successfully");
  } catch (error) {
    console.log("error", error);
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
