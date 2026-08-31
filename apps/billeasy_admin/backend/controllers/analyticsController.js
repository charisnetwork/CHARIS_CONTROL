const { 
  Company, 
  Subscription, 
  Plan, 
  Invoice,
  User,
  Coupon
} = require('../models/saasModels');
const { Op, fn, col } = require('sequelize');
const { saasDB } = require('../config/db');

// GET /admin/dashboard/summary
exports.getSummary = async (req, res) => {
  try {
    const totalSubscribers = await Subscription.count({ where: { status: 'active' } });
    const totalRevenue = await Subscription.sum('price', { where: { payment_status: 'paid' } }) || 0;
    
    // Group by plan type
    const plans = await Plan.findAll();
    const planCounts = await Promise.all(plans.map(async (plan) => {
      const count = await Subscription.count({ 
        where: { plan_id: plan.id, status: 'active' } 
      });
      return { plan_name: plan.plan_name, count };
    }));

    res.json({
      totalSubscribers,
      totalRevenue,
      planCounts
    });
  } catch (error) {
    console.error("Summary Error:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
};

// GET /admin/dashboard/revenue?type=weekly|monthly
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { type } = req.query;
    let results;

    if (type === 'weekly') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      results = await Subscription.findAll({
        attributes: [
          [fn('date', col('created_at')), 'date'],
          [fn('sum', col('price')), 'revenue']
        ],
        where: {
          payment_status: 'paid',
          created_at: { [Op.gte]: sevenDaysAgo }
        },
        group: [fn('date', col('created_at'))],
        order: [[fn('date', col('created_at')), 'ASC']]
      });
    } else {
      // Monthly
      results = await Subscription.findAll({
        attributes: [
          [fn('date_trunc', 'month', col('created_at')), 'month'],
          [fn('sum', col('price')), 'revenue']
        ],
        where: { payment_status: 'paid' },
        group: [fn('date_trunc', 'month', col('created_at'))],
        order: [[fn('date_trunc', 'month', col('created_at')), 'ASC']]
      });
    }

    res.json(results);
  } catch (error) {
    console.error("Revenue Analytics Error:", error);
    res.status(500).json({ error: "Failed to fetch revenue analytics" });
  }
};

// GET /admin/dashboard/subscribers
exports.getSubscribers = async (req, res) => {
  try {
    const subscribers = await Subscription.findAll({
      include: [
        { model: Plan, attributes: ['plan_name', 'price'] },
        { 
          model: Company,
          attributes: ['id', 'name'],
          include: [{
            model: User,
            attributes: ['id', 'name', 'email', 'mobile_number', 'role'],
            where: { role: 'owner' },
            required: false
          }]
        },
        { model: Coupon, attributes: ['code', 'discount_type', 'discount_value'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(subscribers);
  } catch (error) {
    console.error("Subscribers Error:", error);
    res.status(500).json({ error: "Failed to fetch subscribers" });
  }
};

// GET /admin/coupons/:id/analytics
exports.getCouponAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findByPk(id);
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    const usageCount = await Subscription.count({ where: { coupon_id: id } });
    const totalRevenue = await Subscription.sum('price', { 
      where: { coupon_id: id, payment_status: 'paid' } 
    }) || 0;

    const users = await Subscription.findAll({
      where: { coupon_id: id },
      include: [{ model: Company }, { model: Plan }],
      order: [['createdAt', 'DESC']]
    });

    // Weekly performance
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weeklyPerformance = await Subscription.findAll({
      attributes: [
        [fn('date', col('created_at')), 'date'],
        [fn('count', col('id')), 'count'],
        [fn('sum', col('price')), 'revenue']
      ],
      where: {
        coupon_id: id,
        created_at: { [Op.gte]: sevenDaysAgo }
      },
      group: [fn('date', col('created_at'))],
      order: [[fn('date', col('created_at')), 'ASC']]
    });

    res.json({
      coupon,
      usageCount,
      totalRevenue,
      users,
      weeklyPerformance
    });
  } catch (error) {
    console.error("Coupon Analytics Error:", error);
    res.status(500).json({ error: "Failed to fetch coupon analytics" });
  }
};
