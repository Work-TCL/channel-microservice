import { WalletModel } from "../../database/model";

export const addCommotion = async (accountId: string, amount: number, isBlocked: boolean) => {
    const wallet: any = await WalletModel.findOne({ accountId });

    if (!wallet) {
        await WalletModel.create({
            accountId: accountId,
            balance: 0,
            blockedBalance: amount,
        });
    }

    if (isBlocked) {
        wallet.blockedBalance += amount;
    } else {
        wallet.balance += amount;
    }

    await wallet.save();
    return wallet;
}


export const deductCommotion = async (accountId: string, amount: number) => {
    const wallet: any = await WalletModel.findOne({ accountId });
    if (!wallet) {
        throw new Error("Wallet not found");
    }

    wallet.blockedBalance -= amount;
    await wallet.save();
    return wallet;
}