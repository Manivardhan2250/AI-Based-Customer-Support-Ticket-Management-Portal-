
const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

// All notification routes require authentication.
router.use(authenticateToken);

router.get("/", notificationController.getNotifications);

router.get(
  "/unread-count",
  notificationController.getUnreadCount
);

router.patch(
  "/read-all",
  notificationController.markAllAsRead
);

router.patch(
  "/:id/read",
  notificationController.markAsRead
);

router.delete(
  "/",
  notificationController.deleteAllNotifications
);

router.delete(
  "/:id",
  notificationController.deleteNotification
);

module.exports = router;
