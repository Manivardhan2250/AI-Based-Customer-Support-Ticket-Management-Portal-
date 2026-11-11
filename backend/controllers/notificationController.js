
const pool = require("../config/database");

// GET ALL NOTIFICATIONS
exports.getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT id, ticket_id, title, message, type, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM notifications
       WHERE user_id = $1`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      page,
      limit,
      total: countResult.rows[0].total,
      notifications: result.rows
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications"
    });
  }
};

// GET UNREAD NOTIFICATION COUNT
exports.getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      unread_count: result.rows[0].unread_count
    });
  } catch (error) {
    console.error("Unread count error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve unread count"
    });
  }
};

// MARK ONE NOTIFICATION AS READ
exports.markAsRead = async (req, res) => {
  try {
    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID"
      });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [notificationId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification: result.rows[0]
    });
  } catch (error) {
    console.error("Mark notification read error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update notification"
    });
  }
};

// MARK ALL NOTIFICATIONS AS READ
exports.markAllAsRead = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE
       RETURNING id`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: "Notifications marked as read",
      updated_count: result.rowCount
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update notifications"
    });
  }
};

// DELETE ONE NOTIFICATION
exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID"
      });
    }

    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully"
    });
  } catch (error) {
    console.error("Delete notification error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification"
    });
  }
};

// DELETE ALL NOTIFICATIONS
exports.deleteAllNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: "All notifications deleted successfully",
      deleted_count: result.rowCount
    });
  } catch (error) {
    console.error("Delete all notifications error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to delete notifications"
    });
  }
};
