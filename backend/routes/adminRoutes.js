const express = require("express");
const adminController = require("../controllers/adminController");
const authenticateToken = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorize");

const router = express.Router();
router.use(authenticateToken);

router.get("/users", authorizeRoles("admin", "manager"), adminController.getUsers);
router.post("/users", authorizeRoles("admin"), adminController.createTeamUser);
router.patch("/users/:id", authorizeRoles("admin"), adminController.updateUser);
router.get("/reports", authorizeRoles("admin", "manager"), adminController.getReports);

module.exports = router;
