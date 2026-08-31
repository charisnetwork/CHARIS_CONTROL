const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const managementController = require('../controllers/managementController');

// Note: Auth is handled in server.js with JWT
// These routes are protected by the authMiddleware in server.js

router.post('/login', (req, res) => {
  res.json({ success: true, message: "Authenticated successfully" });
});

router.get('/profile', (req, res) => {
  res.json({ 
    id: 'platform_admin',
    name: 'Platform Administrator',
    email: 'pachu.mgd@gmail.com',
    role: 'superadmin'
  });
});

// Dashboard & Analytics
router.get('/dashboard/summary', analyticsController.getSummary);
router.get('/dashboard/revenue', analyticsController.getRevenueAnalytics);
router.get('/dashboard/subscribers', analyticsController.getSubscribers);

// Coupon Management
router.get('/coupons', managementController.getCoupons);
router.post('/coupons', managementController.createCoupon);
router.put('/coupons/:id', managementController.updateCoupon);
router.delete('/coupons/:id', managementController.deleteCoupon);

// Affiliate Management
router.get('/affiliates', managementController.getAffiliates);
router.post('/affiliates', managementController.createAffiliate);
router.delete('/affiliates/:id', managementController.deleteAffiliate);

// Coupon Detailed Analytics
router.get('/coupons/:id/analytics', analyticsController.getCouponAnalytics);

// Plan & Feature Management
router.get('/plans', managementController.getPlans);
router.patch('/plans/update', managementController.updatePlanFeature);
router.patch('/plans/:id', managementController.updatePlan);

module.exports = router;
