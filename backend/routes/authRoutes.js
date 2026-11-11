
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const authController = require("../controllers/authController");
const authenticateToken = require("../middleware/auth");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post(
  "/forgot-password",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  authController.resetPassword
);
router.post("/change-password", authenticateToken, authController.changePassword);

router.get(
  "/profile",
  authenticateToken,
  authController.getProfile
);

module.exports = router;
