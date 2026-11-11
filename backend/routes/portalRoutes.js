const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorize");
const portalController = require("../controllers/portalController");

router.use(authenticateToken);

// Categories
router.get(
  "/categories",
  authorizeRoles("customer", "agent", "admin", "manager"),
  portalController.getCategories
);

router.post(
  "/categories",
  authorizeRoles("admin"),
  portalController.createCategory
);

router.patch(
  "/categories/:id",
  authorizeRoles("admin"),
  portalController.updateCategory
);

// Ticket conversations
router.get(
  "/tickets/:id/comments",
  authorizeRoles("customer", "agent", "admin", "manager"),
  portalController.getComments
);

router.post(
  "/tickets/:id/comments",
  authorizeRoles("customer", "agent", "admin", "manager"),
  portalController.createComment
);

// Customer feedback
router.post(
  "/tickets/:id/feedback",
  authorizeRoles("customer"),
  portalController.createFeedback
);

router.post(
  "/tickets/:id/escalations",
  authorizeRoles("customer", "agent", "admin", "manager"),
  portalController.createEscalation
);

router.patch(
  "/escalations/:id",
  authorizeRoles("admin", "manager"),
  portalController.updateEscalation
);

router.post(
  "/suggestions",
  authorizeRoles("customer", "agent", "admin", "manager"),
  portalController.suggestTicket
);

// Agent ticket queue
router.get(
  "/agent/queue",
  authorizeRoles("agent"),
  portalController.getAgentQueue
);

router.post(
  "/agent/queue/:id/claim",
  authorizeRoles("agent"),
  portalController.claimTicket
);

// Dashboard analytics
router.get(
  "/analytics",
  authorizeRoles("customer", "agent", "admin", "manager"),
  portalController.getAnalytics
);

module.exports = router;