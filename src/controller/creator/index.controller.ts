import { Response } from "express";
import sendApiResponse from "../../common";
import { CreatorChannelModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";

const getCreatorChannelList = async (req: AuthRequest, res: Response) => {
    const { _id: creatorId } = req.user;
    try {
        const channelList = await CreatorChannelModel.find({ creatorId });
        return sendApiResponse(res, 200, "Channel list fetched successfully", channelList);
    } catch (error) {
        return sendApiResponse(res, 500, "Failed to fetch channel list", error);
    }
}

export { getCreatorChannelList };