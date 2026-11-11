
const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorize");

const ticketController = require("../controllers/ticketController");
const { upload } = require("../middleware/upload");

// All ticket routes require authentication
router.use(authenticateToken);

// 1. Create ticket - Customer only
router.post(
  "/",
  authorizeRoles("customer"),
  upload.array("attachments", 5),
  ticketController.createTicket
);

// 2. Get all accessible tickets
router.get(
  "/",
  authorizeRoles("customer", "agent", "admin", "manager"),
  ticketController.getTickets
);

router.get(
  "/:id/attachments/:attachmentId",
  authorizeRoles("customer", "agent", "admin", "manager"),
  ticketController.downloadAttachment
);

// 3. Get individual ticket
router.get(
  "/:id",
  authorizeRoles("customer", "agent", "admin", "manager"),
  ticketController.getTicketById
);

// 4. Update ticket
router.put(
  "/:id",
  authorizeRoles("customer", "agent", "admin", "manager"),
  ticketController.updateTicket
);

router.patch(
  "/:id/confirmation",
  authorizeRoles("customer"),
  ticketController.confirmResolution
);

// 5. Assign ticket - Admin or Support Manager
router.patch(
  "/:id/assign",
  authorizeRoles("admin", "manager"),
  ticketController.assignTicket
);

// 6. Delete ticket - Admin only
router.delete(
  "/:id",
  authorizeRoles("admin"),
  ticketController.deleteTicket
);

module.exports = router;
