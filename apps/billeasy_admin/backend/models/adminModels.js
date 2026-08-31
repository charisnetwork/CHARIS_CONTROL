const { DataTypes } = require('sequelize');
const { adminDB } = require('../config/db');

const Affiliate = adminDB.define('Affiliate', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  company_name: { type: DataTypes.STRING, allowNull: false },
  contact_person: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  mobile_no: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' }
}, { tableName: 'Affiliates', timestamps: false });

const PlatformExpense = adminDB.define('PlatformExpense', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  category: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12,2), allowNull: false },
  date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
  description: { type: DataTypes.TEXT }
}, { tableName: 'PlatformExpenses', timestamps: false });

const GlobalNotification = adminDB.define('GlobalNotification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  target_audience: { type: DataTypes.STRING, defaultValue: 'all' },
  sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'GlobalNotifications', timestamps: false });

module.exports = { 
  Affiliate, 
  PlatformExpense, 
  GlobalNotification 
};
