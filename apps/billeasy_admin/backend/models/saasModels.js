const { DataTypes } = require('sequelize');
const { saasDB } = require('../config/db');

const Company = saasDB.define('Company', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING },
  createdAt: { type: DataTypes.DATE }
}, { tableName: 'companies', timestamps: true });

const Plan = saasDB.define('Plan', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  plan_name: { type: DataTypes.STRING },
  price: { type: DataTypes.DECIMAL(10, 2) },
  price_per_month: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  billing_cycle: { type: DataTypes.ENUM('monthly','3month','6month','yearly','lifetime'), defaultValue: 'monthly' }
}, { tableName: 'plans' });

const PlanFeature = saasDB.define('PlanFeature', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  plan_name: { type: DataTypes.STRING, allowNull: false },
  feature_key: { type: DataTypes.STRING, allowNull: false },
  is_enabled: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'plan_features' });

const Coupon = saasDB.define('Coupon', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  discount_type: { type: DataTypes.ENUM('percentage', 'flat'), defaultValue: 'percentage' },
  discount_value: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
  expiry_date: { type: DataTypes.DATE },
  usage_limit: { type: DataTypes.INTEGER, defaultValue: 100 },
  usage_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  affiliate_id: { type: DataTypes.UUID, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'coupons' });

const Subscription = saasDB.define('Subscription', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  company_id: { type: DataTypes.UUID },
  plan_id: { type: DataTypes.UUID },
  coupon_id: { type: DataTypes.UUID, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  status: { type: DataTypes.ENUM('active', 'expired', 'cancelled', 'trial') },
  payment_status: { type: DataTypes.ENUM('paid', 'pending', 'failed') },
  start_date: { type: DataTypes.DATE },
  expiry_date: { type: DataTypes.DATE },
  createdAt: { type: DataTypes.DATE }
}, { tableName: 'subscriptions' });

const Invoice = saasDB.define('Invoice', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  total_amount: { type: DataTypes.DECIMAL(12, 2) },
  company_id: { type: DataTypes.UUID },
  createdAt: { type: DataTypes.DATE }
}, { tableName: 'invoices' });

const User = saasDB.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  mobile_number: { type: DataTypes.STRING, field: 'mobile_number' },
  company_id: { type: DataTypes.UUID },
  role: { type: DataTypes.ENUM('owner', 'admin', 'staff'), defaultValue: 'staff' }
}, { tableName: 'users', timestamps: false, underscored: false });

// Associations for Reporting
Company.hasMany(Subscription, { foreignKey: 'company_id' });
Subscription.belongsTo(Company, { foreignKey: 'company_id' });
Subscription.belongsTo(Plan, { foreignKey: 'plan_id' });
Subscription.belongsTo(Coupon, { foreignKey: 'coupon_id' });
Coupon.hasMany(Subscription, { foreignKey: 'coupon_id' });
Company.hasMany(User, { foreignKey: 'company_id' });

// Coupon - Affiliate Relationship (Cross-database)
const { Affiliate } = require('./adminModels');
Coupon.belongsTo(Affiliate, { foreignKey: 'affiliate_id', as: 'affiliate', constraints: false });
Affiliate.hasMany(Coupon, { foreignKey: 'affiliate_id', as: 'coupons', constraints: false });

module.exports = { 
  Company, 
  Subscription, 
  Plan, 
  PlanFeature,
  Invoice,
  User,
  Coupon
};
