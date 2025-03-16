import { Request, Response } from "express";
import sendApiResponse from "../../../common";
import { INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, INSTAGRAM_REDIRECT_URI } from "../../../config";
import axios from "axios";

const handleInstagramAuthCallback = async (req: Request, res: Response) => {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: "Authorization failed" });
  
    try {
      // Exchange code for access token
      const response = await axios.post("https://api.instagram.com/oauth/access_token", null, {
        params: {
          client_id: INSTAGRAM_CLIENT_ID,
          client_secret: INSTAGRAM_CLIENT_SECRET,
          grant_type: "authorization_code",
          redirect_uri: INSTAGRAM_REDIRECT_URI,
          code: code,
        },
      });
      console.log("response", response);
  
      const { access_token, user_id } = response.data;
      console.log("access_token", access_token);
      return sendApiResponse(res, 200, "Instagram auth callback successful", { access_token, user_id });
    } catch (error) {
        console.log("error while exchanging code for access token", error);
        return sendApiResponse(res, 500, "Something went wrong", error);
    }
}

export { handleInstagramAuthCallback };