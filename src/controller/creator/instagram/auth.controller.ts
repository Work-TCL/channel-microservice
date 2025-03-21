import { Request, Response } from "express";
import sendApiResponse from "../../../common";
import { INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, INSTAGRAM_REDIRECT_URI } from "../../../config";
import axios from "axios";
import { CreatorChannelModel, CreatorModel } from "../../../database/model";
import { AuthRequest } from "../../../types/authRequest";

/**
 * Handles Instagram authentication callback, exchanges code for access token,
 * fetches user details, generates a long-lived token, and saves the user channel data.
 */
const handleInstagramAuthCallback = async (req: AuthRequest, res: Response) => {
    const { _id: creatorId } = req.user; // Extract authenticated creator ID
    const { code } = req.query;

    // Validate presence of authorization code
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: "Missing or invalid Instagram authorization code" });
    }

    try {
        // Check if the creator already has an Instagram channel connected
        const existingChannel = await CreatorChannelModel.findOne({
            creatorId,
            channelType: "instagram",
        });

        if (existingChannel) {
            return sendApiResponse(res, 400, "Creator's Instagram channel is already connected.");
        }

        // Step 1: Exchange authorization code for a short-lived access token
        const params = new URLSearchParams();
        params.append('client_id', INSTAGRAM_CLIENT_ID || '');
        params.append('client_secret', INSTAGRAM_CLIENT_SECRET || '');
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', 'https://trurereff-new.vercel.app/login'); // Must match Instagram App settings
        params.append('code', code);

        const response = await axios.post("https://api.instagram.com/oauth/access_token", params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const { access_token, user_id } = response.data; // Extract short-lived token
        console.log("Short-lived Access Token:", access_token);

        // Step 2: Exchange short-lived token for a long-lived token
        const long_lived_token = await exchangeForLongLivedToken(access_token);
        if (!long_lived_token) {
            throw new Error("Failed to generate long-lived Instagram token");
        }

        // Step 3: Fetch user details using the access token
        const instagramUserData = await fetchInstagramUserData(long_lived_token);
        if (!instagramUserData.id) {
            throw new Error("Failed to fetch Instagram user data");
        }

        console.log("Instagram User Data:", instagramUserData);

        // Step 4: Create a new channel entry for the authenticated creator
        const newChannel = new CreatorChannelModel({
            creatorId,
            channelId: instagramUserData.id,
            handleName: instagramUserData.username,
            channelName: instagramUserData.name,
            channelType: "instagram",
            token: long_lived_token,
        });

        // Step 5: Associate the new channel with the creator and save to the database
        const creator = await CreatorModel.findById(creatorId);
        if (!creator) {
            return sendApiResponse(res, 404, "Creator not found");
        }

        creator.channels.push(newChannel._id); // Link channel to creator
        await creator.save();
        await newChannel.save();

        return sendApiResponse(res, 200, "Instagram authentication successful", newChannel);

    } catch (error) {
        console.error("Error during Instagram authentication process:", error);
        return sendApiResponse(res, 500, "An error occurred while processing Instagram authentication", error);
    }
};

/**
 * Exchanges a short-lived Instagram access token for a long-lived token.
 * @param accessToken - Short-lived Instagram access token.
 */
const exchangeForLongLivedToken = async (accessToken: string) => {
    try {
        const response = await axios.get(`https://graph.instagram.com/access_token`, {
            params: {
                grant_type: "ig_exchange_token",
                client_secret: INSTAGRAM_CLIENT_SECRET,
                access_token: accessToken,
            },
        });

        return response.data.access_token;
    } catch (error) {
        console.error("Error exchanging for long-lived token:", error);
        return null;
    }
};

/**
 * Fetches Instagram user details using an access token.
 * @param accessToken - Long-lived Instagram access token.
 */
const fetchInstagramUserData = async (accessToken: string) => {
    try {
        const response = await axios.get(`https://graph.instagram.com/me`, {
            params: {
                fields: "id,username,name",
                access_token: accessToken,
            },
        });

        return response.data;
    } catch (error) {
        console.error("Error fetching Instagram user data:", error);
        return {};
    }
};

const getInstagramVideoStats = async (access_token: string, channelId: string) => {
    try {
        if (!access_token || typeof access_token !== "string") {
            throw new Error("Missing or invalid access token");
        }

        // Step 1: Fetch last 5 videos
        const mediaResponse = await axios.get("https://graph.instagram.com/me/media", {
            params: {
                fields: "id,media_type,timestamp",
                access_token,
                limit: 50, // Fetching more to filter videos
            },
        });

        const mediaItems = mediaResponse.data.data;
        // Filter only video posts
        const videoPosts = mediaItems.filter((item: any) => item.media_type === "VIDEO");

        if (!videoPosts.length) {
            throw new Error("No video posts found");
        }

        // Sort by timestamp (latest first)
        videoPosts.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Step 2: Get last 5 video IDs
        const lastFiveVideoIds = videoPosts.slice(0, 5).map((video: any) => video.id);

        // Step 3: Fetch views for last 5 videos
        let lastFiveViews = 0;
        for (const videoId of lastFiveVideoIds) {
            const insightsResponse = await axios.get(`https://graph.instagram.com/${videoId}/insights`, {
                params: {
                    metric: "total_interactions",
                    access_token,
                },
            });

            // Check for 403 error
            if (insightsResponse.status === 403) {
                throw new Error("Access forbidden: Check your app permissions and access token.");
            }

            const views = insightsResponse?.data?.data?.[0]?.values?.[0]?.value || 0;
            lastFiveViews += views;
        }

        // Step 4: Calculate one month ago (without dayjs)
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        // Step 5: Get total views for videos uploaded in last month
        let totalMonthViews = 0;
        for (const video of videoPosts) {
            if (new Date(video.timestamp) >= oneMonthAgo) {
                const insightsResponse = await axios.get(`https://graph.instagram.com/${video.id}/insights`, {
                    params: {
                        metric: "total_interactions",
                        access_token,
                    },
                });

                // Check for 403 error
                if (insightsResponse.status === 403) {
                    throw new Error("Access forbidden: Check your app permissions and access token.");
                }

                const views = insightsResponse?.data?.data?.[0]?.values?.[0]?.value || 0;
                totalMonthViews += views;
            } else {
                break; // Stop checking once we go past 1 month
            }
        }

        await CreatorChannelModel.updateOne({ channelId }, { $set: { lastFiveVideoViews: lastFiveViews, lastMonthViews: totalMonthViews } });
    } catch (error: any) {
        console.error("Error while fetching Instagram video stats:", error);
    }
};

const refreshInstagramToken = async (long_lived_token: string) => {
    try {
        const response = await axios.get(
            `https://graph.instagram.com/refresh_access_token`, {
            params: {
                grant_type: "ig_refresh_token",
                access_token: long_lived_token
            }
        }
        );

        const newToken = response.data.access_token;
        console.log("✅ Refreshed Instagram Token:", newToken);

        // Save the new token securely (e.g., update in DB or env file)
    } catch (error: any) {
        console.error("❌ Error refreshing Instagram token:", error.response?.data || error.message);
    }
};


export { handleInstagramAuthCallback, fetchInstagramUserData, getInstagramVideoStats, exchangeForLongLivedToken, refreshInstagramToken };