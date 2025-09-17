import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import { ChannelModel } from "../../database/model";

const getShopifyProductList = async (req: AuthRequest, res: Response) => {
    console.log("shopifyProduct.ts")
    const { _id: vendorId } = req.user;
    try {
        const { per_page, cursor } = req.query;

        //find channeldata by vendorId
        const channel = await ChannelModel.findOne({ channelType: "shopify", vendorId: vendorId });
        if (!channel) {
            return sendApiResponse(res, 400, "Shopify channel not found");
        }

        const formData = new URLSearchParams();
        formData.append("shop", channel.channelConfig.domain);//shopify app domain
        formData.append("per_page", per_page ? per_page.toString() : '0');
        cursor && formData.append("cursor", cursor.toString());
        
        const response = await fetch('https://qreff-integration.terreza.com/api/admin/product/list', {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Bearer ${channel.channelConfig.access_token}`
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Shopify Product List Error: ${response.status} - ${errorText}`);
            return sendApiResponse(res, response.status, "Failed to fetch Shopify product list", { error: errorText });
        }

        const data = await response.json();

        if (!data || !data.data || !data.data.products) {
            console.error("Invalid response structure from Shopify API", data);
            return sendApiResponse(res, 502, "Bad Gateway - Unexpected response structure", data);
        }

        return sendApiResponse(res, 200, "Shopify product list fetched successfully", data.data);
    } catch (error: any) {
        console.error("Unexpected error during Shopify product list fetch:", error);

        if (error.name === "FetchError") {
            return sendApiResponse(res, 502, "Bad Gateway - Unable to reach Shopify API");
        }

        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

const getShopifyProductById = async (req: AuthRequest, res: Response) => {
    const { _id: vendorId } = req.user;
    const { productId } = req.query;
    try{
        const channel = await ChannelModel.findOne({ channelType: "shopify", vendorId: vendorId });
        if (!channel) {
            return sendApiResponse(res, 400, "Shopify channel not found");
        }

        const formData = new URLSearchParams();
        formData.append("shop", channel.channelConfig.domain);
        formData.append("product_id", productId as string);

        const response = await fetch('https://qreff-integration.terreza.com/api/admin/product-detail', {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Bearer ${channel.channelConfig.access_token}`
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Shopify Product Get Error: ${response.status} - ${errorText}`);
            return sendApiResponse(res, response.status, "Failed to fetch Shopify product", { error: errorText });
        }
        
        const data = await response.json();
        return sendApiResponse(res, 200, "Shopify product fetched successfully", data.data);
    }
    catch(error:any){
        console.error("Unexpected error during Shopify product get:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
}

export { getShopifyProductList, getShopifyProductById };
