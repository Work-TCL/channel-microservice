import { Request, Response } from "express";
import sendApiResponse from "../../../common";
import axios from "axios";
import { YOUTUBE_API_KEY } from "../../../config";
import { CreatorChannelModel } from "../../../database/model";
import { AuthRequest } from "../../../types/authRequest";

/**
 * Fetch last 5 videos' view counts for a given YouTube channel ID.
 */
const getYoutubeVideoData = async (req: Request, res: Response) => {
    try {
        const { channelId } = req.query;

        if (!channelId) {
            return sendApiResponse(res, 400, "Channel ID is required");
        }

        // Validate if the channel ID exists
        const channelResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&id=${channelId}&part=id`
        );

        if (!channelResponse.data.items.length) {
            return sendApiResponse(res, 404, "Invalid or non-existent channel ID");
        }

        // Fetch last 5 videos
        const videoResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=id&order=date&type=video&maxResults=5`
        );

        if (!videoResponse.data.items.length) {
            return sendApiResponse(res, 404, "No videos found for this channel");
        }

        const videoIds = videoResponse.data.items.map((item: any) => item.id.videoId).join(",");

        // Fetch view counts for these videos
        const statsResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=statistics`
        );

        const videoStats = statsResponse.data.items.map((video: any) => ({
            videoId: video.id,
            title: video.snippet.title,
            thumbnail: video.snippet.thumbnails.high.url,
            publishedAt: video.snippet.publishedAt,
            videoLink: `https://www.youtube.com/watch?v=${video.id}`,
            views: video.statistics.viewCount,
            likes: video.statistics.likeCount || "N/A", // Some videos may not have like count
        }));

        return sendApiResponse(res, 200, "YouTube video data fetched successfully", videoStats);
    } catch (error: any) {
        console.log("error while fetching youtube video data", error);
        return sendApiResponse(res, 500, "Failed to fetch data", error.message);
    }
};

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
            creatorId,
            channelId,
            handleName: channelName,
            channelName: fetchedChannelName,
            channelType: "youtube",
        });

        await newChannel.save();

        return sendApiResponse(res, 200, "Channel validated and stored successfully", {
            channelId,
            channelName: fetchedChannelName,
        });
    } catch (error: any) {
        return sendApiResponse(res, 500, "Failed to validate and store channel", error.message);
    }
};

export { getYoutubeVideoData, validateYoutubeChannel };
