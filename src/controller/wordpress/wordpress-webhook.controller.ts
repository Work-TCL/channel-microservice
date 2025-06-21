import { Request, Response } from "express";

export const wordPressWebhook = async (req: Request, res: Response) => {
  try {
    console.log("object----",req.body)
  } catch (e: any) {
    console.error("Error in attributedOrder:", e.message || e);
    return null;    
  }
};
