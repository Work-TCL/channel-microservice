import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { ChannelModel, VendorModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import axios from "axios";

const loginToShopify = async (): Promise<{ token?: string } | null> => {
    try {
        const formData = new URLSearchParams();
        formData.append("email", "admin@test.com");
        formData.append("password", "admin");

        const response = await fetch("https://qreff-integration.terreza.com/api/admin/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
        });

        if (!response.ok) {
            console.error(`Shopify Login Error: ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Unexpected error during Shopify login:", error);
        return null;
    }
};

const connectShopifyStore = async (req: AuthRequest, res: Response) => {
    const { _id: vendorId } = req.user;

    try {
        const { id_string } = req.body;
        if(!id_string) {
            return sendApiResponse(res, 400, "id_string is required");
        }

        // check if shopify store already not exists for this vendor
        const existingChannel = await ChannelModel.findOne({ channelType: "shopify", vendorId: vendorId });
        if (existingChannel) {
            return sendApiResponse(res, 200, "Shop already connected", existingChannel);
        }

        const loginData = await loginToShopify();// get access token

        if (!loginData || !loginData.token) {
            return sendApiResponse(res, 401, "Unauthorized - Shopify login failed");
        }

        // get shop details
        const response = await fetch("https://qreff-integration.terreza.com/api/admin/shop", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${loginData.token}`
            },
            body: JSON.stringify({
                id_string: id_string
            })
        });

        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Shopify Shop Fetch Error: ${response.status} - ${errorText}`);
            return sendApiResponse(res, response.status, "Failed to fetch shop details", { error: errorText });
        }
        
        const data = await response.json();

        // create channel
        const channel = await ChannelModel.create({
            channelId: id_string,
            channelType: "shopify",
            channelStatus: "active",
            vendorId: vendorId,
            channelConfig: {
                domain: data.data.domain,
                name: data.data.name,
                shopify_store_id: data.data.shopify_store_id,
                access_token: loginData.token,
            }
        });
        await channel.save();
        const updatedVendor = await VendorModel.findByIdAndUpdate(vendorId, { $set: { completed_step: 3 } }, { new: true });

        return sendApiResponse(res, 200, "Shop connected successfully", { ...channel.toObject(), ...updatedVendor?.toObject() });
    } catch (error: any) {
        console.error("Unexpected error during Shopify store connection:", error);

        if (error.name === "FetchError") {
            return sendApiResponse(res, 502, "Bad Gateway - Unable to reach Shopify API");
        }

        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

export const generateShopifyUTM = async (req: AuthRequest, res: Response) => {
    try {
        const {
            id,
            discount_type,
            discount_value,
            coupon_code,
            expires_at,
            product_id,
            creator_id,
            creator_name,
            collaboration_id,
            commission_percentage,
            shop,
            access_token
        } = req.body;

        console.log("📥 Incoming Request Body:", req.body);

        if (!shop) {
            return sendApiResponse(res, 400, "Shop domain is required");
        }

        const url = "https://qreff-integration.terreza.com/api/admin/utm/create";

        // Create FormData
        const formData = new FormData();
        formData.append("discount_type", discount_type);
        formData.append("discount_value", String(discount_value)); // Ensure numeric values are strings
        formData.append("coupon_code", coupon_code);
        formData.append("expires_at", expires_at);
        formData.append("product_id", product_id);
        formData.append("creator_id", creator_id);
        formData.append("creator_name", creator_name);
        formData.append("collaboration_id", collaboration_id);
        formData.append("status", "ACTIVE");
        formData.append("shop", shop);
        formData.append("commission_percentage", String(commission_percentage));

        console.log("📦 FormData Contents:", Object.fromEntries(formData.entries()));

        // Make Axios request
        const response = await axios.post(url, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
                Authorization: `Bearer ${access_token}`,
                "User-Agent": "Mozilla/5.0", 
                Accept: "application/json",
            },
        });

        console.log("✅ Shopify UTM Created Successfully:", response.data);
        return sendApiResponse(res, 201, "Shopify UTM created successfully", response.data);

    } catch (error: any) {
        if (error.response) {
            // Handle API errors
            console.error(`❌ Shopify UTM Create Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            return sendApiResponse(res, error.response.status, "Failed to create Shopify UTM", error.response.data);
        } else {
            // Handle unexpected errors
            console.error("❌ Unexpected Error Creating Shopify UTM:", error);
            return sendApiResponse(res, 500, "Internal server error", { error: error.message });
        }
    }
};

export { connectShopifyStore };
