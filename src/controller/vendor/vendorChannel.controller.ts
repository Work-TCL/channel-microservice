import { Response } from "express";
import { AuthRequest } from "../../types/authRequest";
import sendApiResponse from "../../common";
import { ChannelModel } from "../../database/model";

const getVendorChannelsList = async (req: AuthRequest, res: Response) => {
    const { _id: vendorId } = req.user;
    
    try {
        const channels = await ChannelModel.find({ vendorId });

        return sendApiResponse(res, 200, "Vendor channels list", channels);
    } catch (error) {
        console.log("fetch channels list for vendor", error)
        return sendApiResponse(res, 500, "Internal server error", error);
    }
}

export { getVendorChannelsList };