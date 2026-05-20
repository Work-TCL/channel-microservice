import { Request, Response } from "express";
import sendApiResponse from "../../../common";
import { APP_SCHEMA, FRONTEND_URL, INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, INSTAGRAM_REDIRECT_URI } from "../../../config";
import axios from "axios";
import { CreatorChannelModel, CreatorModel } from "../../../database/model";

/**
 * Handles Instagram authentication callback, exchanges code for access token,
 * fetches user details, generates a long-lived token, and saves the user channel data.
 */
const handleInstagramAuthCallback = async (req: Request, res: Response) => {
    const { code, state } = req.query;
    const creatorId = state ? (state as string).split("-")[0] : null;
    const redirectUrl = (state ? (state as string).split("-")[1] : null) === "app" ? APP_SCHEMA + '://(auth)' : FRONTEND_URL;

    console.log("code", code, state);

    if (!code || !creatorId) {
        return res.redirect(`${redirectUrl}/creator-registration?tab=1&error=Missing required parameters`);
    }

    try {
        // Check if the creator already has an Instagram channel connected
        const existingChannel = await CreatorChannelModel.findOne({
            creatorId,
            channelType: "instagram",
        });

        if (existingChannel) {
            return res.redirect(`${redirectUrl}/creator-registration?tab=1&error=Creator's Instagram channel is already connected`);
        }

        // Step 1: Exchange authorization code for a short-lived access token
        const params = new URLSearchParams();
        params.append("client_id", INSTAGRAM_CLIENT_ID || "");
        params.append("client_secret", INSTAGRAM_CLIENT_SECRET || "");
        params.append("grant_type", "authorization_code");
        params.append("redirect_uri", INSTAGRAM_REDIRECT_URI || ''); // Must match Instagram App settings
        params.append("code", code as string);

        const response = await axios.post("https://api.instagram.com/oauth/access_token", params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        const { access_token, user_id } = response.data;

        // Step 2: Exchange short-lived token for a long-lived token
        const long_lived_token = await exchangeForLongLivedToken(access_token);
        if (!long_lived_token) {
            return res.redirect(`${redirectUrl}/creator-registration?tab=1&error=Failed to generate long-lived Instagram token`);
        }

        // Step 3: Fetch user details using the access token
        const instagramUserData = await fetchInstagramUserData(long_lived_token);
        if (!instagramUserData.id) {
            return res.redirect(`${redirectUrl}/creator-registration?tab=1&error=Failed to fetch Instagram user data`);
        }

        // Step 4: Create a new channel entry for the authenticated creator
        const newChannel = new CreatorChannelModel({
            creatorId,
            channelId: instagramUserData.id,
            handleName: instagramUserData.username,
            channelName: instagramUserData.username,
            followers: instagramUserData.followers_count,
            channelType: "instagram",
            token: long_lived_token,
        });

        // if (instagramUserData.followers_count < 1000) {
        //     return res.redirect(`${redirectUrl}/creator-registration?tab=1&error=Minimum 1,000 followers required to continue!`);
        // }

        // Step 5: Associate the new channel with the creator and save to the database
        const creator = await CreatorModel.findById(creatorId);
        if (!creator) {
            return res.redirect(`${redirectUrl}/creator-registration?tab=1&error=Creator not found`);
        }

        creator.channels.push(newChannel._id);
        await creator.save();
        await newChannel.save();
        console.log("hello", newChannel, redirectUrl)
        return res.redirect(`${redirectUrl}/creator-registration?tab=1&success=Instagram authentication successful`);

    } catch (error) {
        console.error("Error during Instagram authentication process:", error);
        return res.redirect(`${redirectUrl}/creator-registration?tab=1&error=An error occurred while processing Instagram authentication`);
    }
};

/**
 * Exchanges a short-lived Instagram access token for a long-lived token.
 * @param accessToken - Short-lived Instagram access token.
 */
const exchangeForLongLivedToken = async (accessToken: string) => {
    try {
        console.log("accessToken", accessToken);
        console.log("INSTAGRAM_CLIENT_SECRET", INSTAGRAM_CLIENT_SECRET);
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
                fields: "id,username,name, followers_count",
                access_token: accessToken,
            },
        });
        console.log("hello", response)

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

const getMidnightInstagramData = async () => {
    try {
        const channels = await CreatorChannelModel.find({
            channelType: "instagram",
            token: { $exists: true, $ne: null },
        }).limit(1).sort({ createdAt: -1 }).lean();

        console.log(`Instagram sync started for ${channels.length} channels`);

        await Promise.allSettled(
            channels.map(async (channel: any) => {
                try {
                    // Fetch latest user data
                    const instagramUserData = await fetchInstagramUserData(
                        channel.token
                    );

                    if (!instagramUserData?.id) {
                        console.log(
                            `Invalid Instagram data for channel ${channel.channelId}`
                        );

                        await CreatorChannelModel.updateOne(
                            { _id: channel._id },
                            {
                                $set: {
                                    tokenExpired: true,
                                },
                            }
                        );

                        return;
                    }

                    await CreatorChannelModel.updateOne(
                        { _id: channel._id },
                        {
                            $set: {
                                username: instagramUserData.username,
                                followers: instagramUserData.followers_count || 0,
                                tokenExpired: false,
                                lastSyncedAt: new Date(),
                            },
                        }
                    );
                } catch (error: any) {
                    console.log(
                        `Instagram sync failed for ${channel.channelId}`,
                        error?.response?.data || error.message
                    );
                }
            })
        );

        console.log("Instagram midnight sync completed");
    } catch (error: any) {
        console.log(
            "Error while getting midnight instagram data",
            error.message
        );
    }
};

/**
 * Refreshes Instagram long-lived tokens for all Instagram channels.
 * Only refreshes tokens that were last updated more than 10 days ago.
 */
const refreshInstagramToken = async () => {
    try {
        // Refresh every 45 days
        const refreshBeforeDays = 45;

        const refreshDate = new Date();
        refreshDate.setDate(
            refreshDate.getDate() - refreshBeforeDays
        );

        const instagramChannels = await CreatorChannelModel.find({
            channelType: "instagram",
            token: { $exists: true, $ne: null },
            tokenExpired: { $ne: true },
            $or: [
                { lastTokenGenerated: { $exists: false } },
                { lastTokenGenerated: { $lte: refreshDate } },
            ],
        }).lean();

        if (!instagramChannels.length) {
            console.log(
                "✅ No Instagram tokens need refreshing."
            );
            return;
        }

        console.log(
            `🔄 Refreshing ${instagramChannels.length} Instagram tokens`
        );

        await Promise.allSettled(
            instagramChannels.map(async (channel: any) => {
                try {
                    const response = await axios.get(
                        "https://graph.instagram.com/refresh_access_token",
                        {
                            params: {
                                grant_type: "ig_refresh_token",
                                access_token: channel.token,
                            },
                            timeout: 10000,
                        }
                    );

                    const newToken =
                        response?.data?.access_token;

                    if (!newToken) {
                        console.log(
                            `❌ No token returned for ${channel.channelName}`
                        );

                        return;
                    }

                    await CreatorChannelModel.updateOne(
                        { _id: channel._id },
                        {
                            $set: {
                                token: newToken,
                                tokenExpired: false,
                                lastTokenGenerated: new Date(),
                                tokenExpiresIn:
                                    response.data.expires_in,
                            },
                        }
                    );

                    console.log(
                        `✅ Token refreshed for ${channel.channelName}`
                    );
                } catch (error: any) {
                    const errorData =
                        error?.response?.data;

                    console.log(
                        `❌ Failed refresh for ${channel.channelName}`,
                        errorData || error.message
                    );

                    const errorMessage =
                        errorData?.error?.message || "";

                    const isInvalidToken =
                        errorMessage.includes(
                            "Error validating access token"
                        ) ||
                        errorMessage.includes(
                            "invalid_token"
                        );

                    if (isInvalidToken) {
                        await CreatorChannelModel.updateOne(
                            { _id: channel._id },
                            {
                                $set: {
                                    tokenExpired: true,
                                    tokenInvalidAt:
                                        new Date(),
                                },
                            }
                        );

                        console.log(
                            `⚠️ Token marked expired for ${channel.channelName}`
                        );
                    }
                }
            })
        );

        console.log(
            "✅ Instagram token refresh completed"
        );
    } catch (error: any) {
        console.error(
            "❌ Error refreshing Instagram tokens:",
            error.message
        );
    }
};
export { handleInstagramAuthCallback, fetchInstagramUserData, getMidnightInstagramData, exchangeForLongLivedToken, refreshInstagramToken };
