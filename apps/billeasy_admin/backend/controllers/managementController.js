const { Coupon, Subscription, Plan, PlanFeature } = require('../models/saasModels');
const { Affiliate } = require('../models/adminModels');
const { Op } = require('sequelize');

// Plans & Features
exports.getPlans = async (req, res) => {
  try {
    const plans = await Plan.findAll({ order: [['price', 'ASC']] });
    const planFeatures = await PlanFeature.findAll();

    const result = plans.map(plan => {
      const features = planFeatures.filter(pf => pf.plan_name === plan.plan_name);
      return {
        ...plan.toJSON(),
        granular_features: features
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Get Plans Error:", error);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { price, price_per_month, billing_cycle, is_active } = req.body;

    const plan = await Plan.findByPk(id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    await plan.update({ price, price_per_month, billing_cycle, is_active });
    res.json({ message: "Plan updated successfully", plan });
  } catch (error) {
    console.error("Update Plan Error:", error);
    res.status(500).json({ error: "Failed to update plan" });
  }
};

exports.updatePlanFeature = async (req, res) => {
  try {
    const { plan_name, feature_key, is_enabled } = req.body;

    const [feature, created] = await PlanFeature.findOrCreate({
      where: { plan_name, feature_key },
      defaults: { is_enabled }
    });

    if (!created) {
      await feature.update({ is_enabled });
    }

    res.json({ message: "Plan feature updated successfully", feature });
  } catch (error) {
    console.error("Update Plan Feature Error:", error);
    res.status(500).json({ error: "Failed to update plan feature" });
  }
};

// Affiliates
exports.getAffiliates = async (req, res) => {
  try {
    const affiliates = await Affiliate.findAll({ order: [['company_name', 'ASC']] });
    res.json(affiliates);
  } catch (error) {
    console.error("Get Affiliates Error:", error);
    res.status(500).json({ error: "Failed to fetch affiliates" });
  }
};

exports.createAffiliate = async (req, res) => {
  try {
    const affiliate = await Affiliate.create(req.body);
    res.status(201).json(affiliate);
  } catch (error) {
    console.error("Create Affiliate Error:", error);
    res.status(500).json({ error: "Failed to create affiliate" });
  }
};

exports.deleteAffiliate = async (req, res) => {
  try {
    const { id } = req.params;
    await Affiliate.destroy({ where: { id } });
    res.json({ message: "Affiliate deleted" });
  } catch (error) {
    console.error("Delete Affiliate Error:", error);
    res.status(500).json({ error: "Failed to delete affiliate" });
  }
};
// GET /admin/coupons
exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.findAll({ 
      include: [{ model: Affiliate, as: 'affiliate' }],
      order: [['createdAt', 'DESC']] 
    });

    const detailedCoupons = await Promise.all(coupons.map(async (coupon) => {
      const usageCount = await Subscription.count({ where: { coupon_id: coupon.id } });
      const revenueGenerated = await Subscription.sum('price', { 
        where: { coupon_id: coupon.id, payment_status: 'paid' } 
      }) || 0;

      const isExpired = coupon.expiry_date && new Date() > new Date(coupon.expiry_date);

      return {
        ...coupon.toJSON(),
        usage_count: usageCount,
        revenue_generated: revenueGenerated,
        is_expired: isExpired
      };
    }));

    res.json(detailedCoupons);
  } catch (error) {
    console.error("Get Coupons Error:", error);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
};

// POST /admin/coupons
exports.createCoupon = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.company_id) {
      data.affiliate_id = data.company_id;
      delete data.company_id;
    }
    const coupon = await Coupon.create(data);
    res.status(201).json(coupon);
  } catch (error) {
    console.error("Create Coupon Error:", error);
    res.status(500).json({ error: "Failed to create coupon" });
  }
};

// PUT /admin/coupons/:id
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findByPk(id);
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    const data = { ...req.body };
    if (data.company_id) {
      data.affiliate_id = data.company_id;
      delete data.company_id;
    }

    await coupon.update(data);
    res.json(coupon);
  } catch (error) {
    console.error("Update Coupon Error:", error);
    res.status(500).json({ error: "Failed to update coupon" });
  }
};

// DELETE /admin/coupons/:id
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findByPk(id);
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    await coupon.destroy();
    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Delete Coupon Error:", error);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
};
