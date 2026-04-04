import mongoose from "mongoose";
import { CollaborationModel, ProductModel, WalletModel } from "../../database/model";

// ✅ Ensure wallet exists (create if not)
export const getOrCreateWallet = async (
  accountId: string,
  session: mongoose.ClientSession | null = null
) => {
  let wallet = await WalletModel.findOne({ accountId }).session(session);
  if (!wallet) {
    wallet = new WalletModel({ accountId });
    await wallet.save({ session });
  }
  return wallet;
};

// ✅ 1. Add commission to blocked balance
export const blockCommission = async (
  accountId: string,
  amount: number,
  session: mongoose.ClientSession | null = null
) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId, session);
  wallet.blockedBalance += amount;
  await wallet.save({ session });
  return wallet;
};

// ✅ 2. Deduct commission from wallet
export const deductFromWallet = async (
  accountId: string,
  amount: number,
  session: mongoose.ClientSession | null = null
) => {
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  const wallet = await getOrCreateWallet(accountId, session);

  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance");
  }

  wallet.balance -= amount;
  await wallet.save({ session });
  return wallet;
};

// ✅ 3. Remove blocked commission (on cancel/refund)
export const removeBlockedCommission = async (
  accountId: string,
  amount: number,
  session: mongoose.ClientSession | null = null
) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId, session);
  if (wallet.blockedBalance <= amount)
    throw new Error("Insufficient blocked balance");

  wallet.blockedBalance -= amount;
  await wallet.save({ session });
  return wallet;
};

// ✅ 4. Transfer blocked commission → balance (on delivery)
export const releaseBlockedToMain = async (
  accountId: string,
  amount: number,
  session: mongoose.ClientSession | null = null
) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId, session);
  if (wallet.blockedBalance <= amount)
    throw new Error("Insufficient blocked balance");

  wallet.blockedBalance -= amount;
  wallet.balance += amount;
  await wallet.save({ session });
  return wallet;
};

// ✅ 5. Transfer main commission → blocked for vendor while order comes
export const releaseMainToBlocked = async (
  accountId: string,
  vendorId: string,
  amount: number,
  session?: mongoose.ClientSession
) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId, session);

  if (wallet.balance < amount) {
    // pause collaborations
    await CollaborationModel.updateMany(
      { vendorId: vendorId, collaborationStatus: "ACTIVE" },
      { $set: { collaborationStatus: "PAUSED" } },
    );
    await ProductModel.updateMany(
      { vendorId: vendorId, status: "ACTIVE" },
      { $set: { status: "PAUSED" } },
    );
    throw new Error("Insufficient balance");
  }

  wallet.balance -= amount;
  wallet.blockedBalance += amount;
  await wallet.save({ session });
  return wallet;
};
