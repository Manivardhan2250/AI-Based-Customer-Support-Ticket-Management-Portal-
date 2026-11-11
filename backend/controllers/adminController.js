const bcrypt = require("bcrypt");
const pool = require("../config/database");

const TEAM_ROLES = ["agent", "manager"];

exports.getUsers = async (req, res) => {
  try {
    const requestedRole = req.query.role;
    if (requestedRole && !["customer", ...TEAM_ROLES, "admin"].includes(requestedRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
      });
    }

    const values = [];
    let roleFilter = "";
    if (req.user.role === "manager") {
      roleFilter = "WHERE role = 'agent'";
    } else if (requestedRole) {
      values.push(requestedRole);
      roleFilter = "WHERE role = $1";
    }

    const result = await pool.query(
      `SELECT id, name, email, role, is_active, created_at
       FROM users ${roleFilter}
       ORDER BY created_at DESC`,
      values
    );

    return res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error("Get users error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve users",
    });
  }
};

exports.createTeamUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 100 ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 12 ||
      !TEAM_ROLES.includes(role)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid name, email, 12-character password, and team role",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, role]
    );

    return res.status(201).json({
      success: true,
      message: "Team user created successfully",
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }
    console.error("Create team user error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create team user",
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { name, is_active, role } = req.body;
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    if (userId === Number(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own account here",
      });
    }
    if (
      (name !== undefined &&
        (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100)) ||
      (is_active !== undefined && typeof is_active !== "boolean") ||
      (role !== undefined && !TEAM_ROLES.includes(role))
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide valid account fields; supported roles are agent and manager",
      });
    }
    if (name === undefined && is_active === undefined && role === undefined) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update",
      });
    }

    const existing = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [userId]
    );
    if (existing.rows.length === 0 || existing.rows[0].role === "admin") {
      return res.status(404).json({
        success: false,
        message: "Managed user not found",
      });
    }
    if (role !== undefined && !TEAM_ROLES.includes(existing.rows[0].role)) {
      return res.status(400).json({
        success: false,
        message: "Customer accounts cannot be changed to a support role",
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           is_active = COALESCE($2, is_active),
           role = COALESCE($3, role),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND id <> $5
       RETURNING id, name, email, role, is_active, created_at`,
      [
        name === undefined ? null : name.trim(),
        is_active === undefined ? null : is_active,
        role === undefined ? null : role,
        userId,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team user not found",
      });
    }
    return res.json({
      success: true,
      message: "Team user updated successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Update user error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update user",
    });
  }
};

exports.getReports = async (req, res) => {
  try {
    const [status, agents, resolution, categories] = await Promise.all([
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM tickets
         GROUP BY status
         ORDER BY status`
      ),
      pool.query(
        `SELECT
           u.id,
           u.name,
           COUNT(t.id)::int AS assigned,
           COUNT(t.id) FILTER (WHERE t.status = 'Resolved' OR t.status = 'Closed')::int AS resolved,
           ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)
             FILTER (WHERE t.resolved_at IS NOT NULL)::numeric, 1) AS average_resolution_hours
         FROM users u
         LEFT JOIN tickets t ON t.assigned_to = u.id
         WHERE u.role = 'agent' AND u.is_active = TRUE
         GROUP BY u.id, u.name
         ORDER BY u.name`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved_tickets,
           ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
             FILTER (WHERE resolved_at IS NOT NULL)::numeric, 1) AS average_hours,
           ROUND(MIN(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
             FILTER (WHERE resolved_at IS NOT NULL)::numeric, 1) AS fastest_hours,
           ROUND(MAX(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
             FILTER (WHERE resolved_at IS NOT NULL)::numeric, 1) AS longest_hours
         FROM tickets`
      ),
      pool.query(
        `SELECT COALESCE(c.name, 'Uncategorized') AS category,
                COUNT(t.id)::int AS count
         FROM tickets t
         LEFT JOIN ticket_categories c ON c.id = t.category_id
         GROUP BY c.name
         ORDER BY count DESC, category`
      ),
    ]);

    return res.json({
      success: true,
      reports: {
        ticketStatus: status.rows,
        agentPerformance: agents.rows,
        resolutionTime: resolution.rows[0],
        ticketCategory: categories.rows,
      },
    });
  } catch (error) {
    console.error("Reports error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve reports",
    });
  }
};
