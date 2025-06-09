import mongoose from "mongoose";
import ProductSchema from "../../../../shared-models/src/models/product";
import CategorySchema from "../../../../shared-models/src/models/category";
import TagsSchema from "../../../../shared-models/src/models/tags";
import VendorProductSchema from "../../../../shared-models/src/models/vendorProduct";
import CreatorProductSchema from "../../../../shared-models/src/models/creatorProduct";
import CreatorSchema from "../../../../shared-models/src/models/creator";
import VendorSchema from "../../../../shared-models/src/models/vendor";
import CreatorChannelSchema from "../../../../shared-models/src/models/creatorChannel";
import AccountSchema from "../../../../shared-models/src/models/account";
import ChannelSchema from "../../../../shared-models/src/models/channel";
import CollaborationSchema from "../../../../shared-models/src/models/collaboration";
import OrderSchema from "../../../../shared-models/src/models/order";
import ImpressionSchema from "../../../../shared-models/src/models/impression";
import WalletSchema from "../../../../shared-models/src/models/wallet";

const ProductModel = mongoose.model("Product", ProductSchema);
const CategoryModel = mongoose.model("Category", CategorySchema);
const TagsModel = mongoose.model("Tags", TagsSchema);
const VendorProductModel = mongoose.model("VendorProduct", VendorProductSchema);
const CreatorProductModel = mongoose.model(
  "CreatorProduct",
  CreatorProductSchema
);
const VendorModel = mongoose.model("Vendor", VendorSchema);
const CreatorModel = mongoose.model("Creator", CreatorSchema);
const CreatorChannelModel = mongoose.model(
  "CreatorChannel",
  CreatorChannelSchema
);
const AccountModel = mongoose.model("Account", AccountSchema);
const ChannelModel = mongoose.model("Channel", ChannelSchema);
const CollaborationModel = mongoose.model("Collaboration", CollaborationSchema);
const OrderModel = mongoose.model("Order", OrderSchema);
const ImpressionModel = mongoose.model("Impression", ImpressionSchema);
const WalletModel = mongoose.model("Wallet", WalletSchema);

export {
  ProductModel,
  CategoryModel,
  TagsModel,
  VendorProductModel,
  CreatorProductModel,
  VendorModel,
  CreatorModel,
  CreatorChannelModel,
  AccountModel,
  ChannelModel,
  CollaborationModel,
  OrderModel,
  ImpressionModel,
  WalletModel,
};
