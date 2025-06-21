import { WalletModel } from "../../database/model";

// ✅ Ensure wallet exists (create if not)
export const getOrCreateWallet = async (accountId: string) => {
  let wallet = await WalletModel.findOne({ accountId });
  if (!wallet) {
    wallet = await WalletModel.create({ accountId });
  }
  return wallet;
};

// ✅ 1. Add commission to blocked balance
export const blockCommission = async (accountId: string, amount: number) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId);
  wallet.blockedBalance += amount;
  await wallet.save();
  return wallet;
};

// ✅ 2. Deduct commission from wallet
export const deductFromWallet = async (accountId: string, amount: number) => {
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  const wallet = await getOrCreateWallet(accountId);

  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance");
  }

  wallet.balance -= amount;
  await wallet.save();
  return wallet;
};

// ✅ 3. Remove blocked commission (on cancel/refund)
export const removeBlockedCommission = async (
  accountId: string,
  amount: number
) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId);
  if (wallet.blockedBalance < amount)
    throw new Error("Insufficient blocked balance");

  wallet.blockedBalance -= amount;
  await wallet.save();
  return wallet;
};

// ✅ 4. Transfer blocked commission → balance (on delivery)
export const releaseBlockedToMain = async (
  accountId: string,
  amount: number
) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId);
  if (wallet.blockedBalance < amount)
    throw new Error("Insufficient blocked balance");

  wallet.blockedBalance -= amount;
  wallet.balance += amount;
  await wallet.save();
  return wallet;
};

// ✅ 5. Transfer main commission → blocked (on cancel/refund)
export const releaseMainToBlocked = async (
  accountId: string,
  amount: number
) => {
  if (amount <= 0) throw new Error("Amount must be positive");

  const wallet = await getOrCreateWallet(accountId);
  if (wallet.balance < amount) throw new Error("Insufficient balance");

  wallet.balance -= amount;
  wallet.blockedBalance += amount;
  await wallet.save();
  return wallet;
};
