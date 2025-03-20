import {  Response } from "express";
import sendApiResponse from "../../../common";
import axios from "axios";
import { YOUTUBE_API_KEY } from "../../../config";
import { CreatorChannelModel, CreatorModel } from "../../../database/model";
import { AuthRequest } from "../../../types/authRequest";

const getYoutubeVideoStats = async (channelId: string) => {
    try {
        if (!channelId) {
            throw new Error('Channel ID is required');
        }

        const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Ensure this is set in env

        // Fetch last 5 video IDs
        const videoResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=id&order=date&type=video&maxResults=5`
        );

        if (!videoResponse.data.items.length) {
            throw new Error('No videos found for this channel');
        }

        const lastFiveVideoIds = videoResponse.data.items.map((item: any) => item.id.videoId).join(",");

        // Fetch total views for last 5 videos
        const statsResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${lastFiveVideoIds}&part=statistics`
        );

        const lastFiveViews = statsResponse.data.items.reduce(
            (sum: number, video: any) => sum + Number(video.statistics.viewCount || 0),
            0
        );

        // Calculate date one month ago (without dayjs)
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const oneMonthAgoISO = oneMonthAgo.toISOString();

        // Fetch all videos uploaded in the last month
        let totalMonthViews = 0;
        let nextPageToken = "";

        do {
            const monthVideoResponse = await axios.get(
                `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=id&order=date&type=video&publishedAfter=${oneMonthAgoISO}&maxResults=50&pageToken=${nextPageToken}`
            );

            if (!monthVideoResponse.data.items.length) break;

            const videoIds = monthVideoResponse.data.items.map((video: any) => video.id.videoId).join(",");

            // Fetch statistics for these videos
            const monthStatsResponse = await axios.get(
                `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=statistics`
            );

            totalMonthViews += monthStatsResponse.data.items.reduce(
                (sum: number, video: any) => sum + Number(video.statistics.viewCount || 0),
                0
            );

            nextPageToken = monthVideoResponse.data.nextPageToken || "";
        } while (nextPageToken);

        await CreatorChannelModel.updateOne({ channelId }, { $set: { lastFiveVideoViews: lastFiveViews, lastMonthViews: totalMonthViews } });
        
    } catch (error: any) {
        console.error("Error while fetching YouTube video stats:", error);
    }
};

const getMidnightYTData = async()=>{
    try{
        const channels = await CreatorChannelModel.find({channelType:"youtube"}).select("channelId");
        for(const channel of channels){
            await getYoutubeVideoStats(channel.channelId);
        }
    }catch(error:any){
        console.log("error while getting midnight YT data", error);
    }
}


/**
 * Validate a YouTube channel name and return its channel ID.
 */
const validateYoutubeChannel = async (req: AuthRequest, res: Response) => {
    const {_id: creatorId} = req.user;
    try {
        const { channelName } = req.body;

        if (!channelName) {
            return sendApiResponse(res, 400, "Channel name is required");
        }

        // Fetch channel details by name
        const channelResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&q=${encodeURIComponent(
                channelName
            )}&part=snippet&type=channel&maxResults=1`
        );

        if (!channelResponse.data.items.length) {
            return sendApiResponse(res, 404, "Channel not found");
        }
        console.log("channelResponse", channelResponse.data.items);
        const channelId = channelResponse.data.items[0].id.channelId;
        const fetchedChannelName = channelResponse.data.items[0].snippet.title;

        // Check if channel already exists
        const existingChannel = await CreatorChannelModel.findOne({ creatorId, channelType: "youtube" });
        if (existingChannel) {
            return sendApiResponse(res, 400, "Channel already exists in the database");
        }

        // Save channel to DB
        const newChannel = new CreatorChannelModel({
            channelId,
            handleName: channelName,
            channelName: fetchedChannelName,
            channelType: "youtube",
        });

        const creator = await CreatorModel.findById(creatorId);
        if(!creator){
            return sendApiResponse(res, 404, "Creator not found");
        }
        creator.channels.push(newChannel._id);
        await creator.save();
        await newChannel.save();
        await getYoutubeVideoStats(channelId);

        return sendApiResponse(res, 200, "Channel validated and stored successfully", {
            channelId,
            channelName: fetchedChannelName,
        });
    } catch (error: any) {
        console.log("error while validating and storing channel", error);
        return sendApiResponse(res, 500, "Failed to validate and store channel", error.message);
    }
};

export { getYoutubeVideoStats, getMidnightYTData, validateYoutubeChannel };
