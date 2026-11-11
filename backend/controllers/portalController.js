const pool = require("../config/database");
const { suggestTicket: getTicketSuggestion } = require("../services/suggestionService");

// Check whether the logged-in user can access a ticket.
async function getAccessibleTicket(ticketId, user) {
  const result = await pool.query(
    `SELECT id, user_id, assigned_to, status
     FROM tickets
     WHERE id = $1`,
    [ticketId]
  );

  if (result.rows.length === 0) {
    return { error: "Ticket not found", status: 404 };
  }

  const ticket = result.rows[0];

  const allowed =
    ["admin", "manager"].includes(user.role) ||
    (user.role === "customer" &&
      Number(ticket.user_id) === Number(user.id)) ||
    (user.role === "agent" &&
      (Number(ticket.assigned_to) === Number(user.id) ||
        (ticket.assigned_to === null && ticket.status === "Open")));

  if (!allowed) {
    return {
      error: "You do not have permission to access this ticket",
      status: 403,
    };
  }

  return { ticket };
}

// --------------------------------------------------
// CATEGORIES
// --------------------------------------------------

exports.getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, is_active
       FROM ticket_categories
       WHERE is_active = TRUE
       ORDER BY name`
    );

    res.json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    console.error("Get categories error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve categories",
    });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const result = await pool.query(
      `INSERT INTO ticket_categories (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, is_active`,
      [name.trim(), description?.trim() || null]
    );

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A category with this name already exists",
      });
    }

    console.error("Create category error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to create category",
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const categoryId = Number(req.params.id);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const { name, description, is_active } = req.body;

    if (
      name === undefined &&
      description === undefined &&
      is_active === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update",
      });
    }

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name cannot be empty",
      });
    }

    if (
      is_active !== undefined &&
      typeof is_active !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_active must be true or false",
      });
    }

    const result = await pool.query(
      `UPDATE ticket_categories
       SET name = COALESCE($1, name),
           description = CASE
             WHEN $2::boolean THEN $3
             ELSE description
           END,
           is_active = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, name, description, is_active`,
      [
        name === undefined ? null : name.trim(),
        description !== undefined,
        description === undefined ? null : description,
        is_active === undefined ? null : is_active,
        categoryId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      message: "Category updated successfully",
      category: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A category with this name already exists",
      });
    }

    console.error("Update category error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to update category",
    });
  }
};

// --------------------------------------------------
// TICKET COMMENTS / CONVERSATION
// --------------------------------------------------

exports.getComments = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID",
      });
    }

    const access = await getAccessibleTicket(ticketId, req.user);

    if (access.error) {
      return res.status(access.status).json({
        success: false,
        message: access.error,
      });
    }

    const result = await pool.query(
      `SELECT
         c.id,
         c.ticket_id,
         c.user_id,
         u.name AS author_name,
         u.role AS author_role,
         c.comment,
         c.is_internal,
         c.created_at
       FROM ticket_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.ticket_id = $1
         AND ($2::boolean = TRUE OR c.is_internal = FALSE)
       ORDER BY c.created_at ASC`,
      [ticketId, req.user.role !== "customer"]
    );

    res.json({
      success: true,
      comments: result.rows,
    });
  } catch (error) {
    console.error("Get comments error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve conversation",
    });
  }
};

exports.createComment = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const { comment, is_internal = false } = req.body;

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID",
      });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot be empty",
      });
    }

    if (comment.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot exceed 5000 characters",
      });
    }

    if (typeof is_internal !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_internal must be true or false",
      });
    }

    if (req.user.role === "customer" && is_internal) {
      return res.status(403).json({
        success: false,
        message: "Customers cannot create internal notes",
      });
    }

    const access = await getAccessibleTicket(ticketId, req.user);

    if (access.error) {
      return res.status(access.status).json({
        success: false,
        message: access.error,
      });
    }

    if (
      access.ticket.status === "Closed" &&
      req.user.role === "customer"
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot reply to a closed ticket",
      });
    }

    const result = await pool.query(
      `INSERT INTO ticket_comments
         (ticket_id, user_id, comment, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING id, ticket_id, user_id, comment,
                 is_internal, created_at`,
      [
        ticketId,
        req.user.id,
        comment.trim(),
        is_internal,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment: result.rows[0],
    });
  } catch (error) {
    console.error("Create comment error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to add comment",
    });
  }
};

// --------------------------------------------------
// CUSTOMER FEEDBACK
// --------------------------------------------------

exports.createFeedback = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const { rating, comments } = req.body;

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID",
      });
    }

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer from 1 to 5",
      });
    }

    if (
      comments !== undefined &&
      comments !== null &&
      (typeof comments !== "string" || comments.length > 2000)
    ) {
      return res.status(400).json({
        success: false,
        message: "Feedback comments cannot exceed 2000 characters",
      });
    }

    const access = await getAccessibleTicket(ticketId, req.user);

    if (access.error) {
      return res.status(access.status).json({
        success: false,
        message: access.error,
      });
    }

    if (req.user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Only customers can submit feedback",
      });
    }

    if (!["Resolved", "Closed"].includes(access.ticket.status)) {
      return res.status(400).json({
        success: false,
        message: "Feedback is available after ticket resolution",
      });
    }

    const result = await pool.query(
      `INSERT INTO ticket_feedback
         (ticket_id, customer_id, rating, comments)
       VALUES ($1, $2, $3, $4)
       RETURNING id, ticket_id, customer_id,
                 rating, comments, created_at`,
      [
        ticketId,
        req.user.id,
        rating,
        comments?.trim() || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Thank you for your feedback",
      feedback: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Feedback has already been submitted for this ticket",
      });
    }

    console.error("Feedback error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to submit feedback",
    });
  }
};

exports.createEscalation = async (req, res) => {
  const ticketId = Number(req.params.id);
  const { reason } = req.body;

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid ticket ID",
    });
  }
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 1000) {
    return res.status(400).json({
      success: false,
      message: "Escalation reason must contain 10 to 1000 characters",
    });
  }

  const access = await getAccessibleTicket(ticketId, req.user);
  if (access.error) {
    return res.status(access.status).json({
      success: false,
      message: access.error,
    });
  }
  if (access.ticket.status === "Closed") {
    return res.status(409).json({
      success: false,
      message: "Closed tickets cannot be escalated",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ticketResult = await client.query(
      "SELECT ticket_number, priority FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );
    if (ticketResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const ticket = ticketResult.rows[0];
    const escalation = await client.query(
      `INSERT INTO ticket_escalations
       (ticket_id, escalated_by, reason, previous_priority, new_priority)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING id, ticket_id, escalated_by, reason, status, created_at`,
      [ticketId, req.user.id, reason.trim(), ticket.priority]
    );
    await client.query(
      `INSERT INTO ticket_history (ticket_id, changed_by, action, new_value)
       VALUES ($1, $2, 'Ticket Escalated', $3)`,
      [ticketId, req.user.id, reason.trim()]
    );
    await client.query(
      `INSERT INTO notifications (user_id, ticket_id, title, message, type)
       SELECT id, $1, 'Ticket Escalated', $2, 'warning'
       FROM users
       WHERE role IN ('admin', 'manager') AND is_active = TRUE`,
      [ticketId, `Ticket ${ticket.ticket_number} has been escalated for review.`]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: "Escalation submitted for review",
      escalation: escalation.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create escalation error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create escalation",
    });
  } finally {
    client.release();
  }
};

exports.updateEscalation = async (req, res) => {
  const escalationId = Number(req.params.id);
  const { status } = req.body;
  if (!Number.isInteger(escalationId) || escalationId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid escalation ID",
    });
  }
  if (!["Reviewed", "Resolved"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Escalation status must be Reviewed or Resolved",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE ticket_escalations
       SET status = $1
       WHERE id = $2 AND status = 'Pending'
       RETURNING id, ticket_id, status`,
      [status, escalationId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending escalation not found",
      });
    }

    await pool.query(
      `INSERT INTO ticket_history (ticket_id, changed_by, action, new_value)
       VALUES ($1, $2, 'Escalation Updated', $3)`,
      [result.rows[0].ticket_id, req.user.id, status]
    );
    return res.json({
      success: true,
      message: "Escalation updated",
      escalation: result.rows[0],
    });
  } catch (error) {
    console.error("Update escalation error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update escalation",
    });
  }
};

exports.suggestTicket = async (req, res) => {
  try {
    const { description } = req.body;
    if (
      typeof description !== "string" ||
      description.trim().length < 5 ||
      description.trim().length > 10000
    ) {
      return res.status(400).json({
        success: false,
        message: "Description must contain 5 to 10000 characters",
      });
    }

    const categories = await pool.query(
      `SELECT id, name FROM ticket_categories
       WHERE is_active = TRUE ORDER BY name`
    );
    const suggestion = await getTicketSuggestion(
      description.trim(),
      categories.rows
    );
    return res.json({ success: true, suggestion });
  } catch (error) {
    console.error("Ticket suggestion error:", error.message);
    return res.status(502).json({
      success: false,
      message: "Unable to generate a ticket suggestion",
    });
  }
};

// --------------------------------------------------
// AGENT QUEUE
// --------------------------------------------------

exports.getAgentQueue = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         t.id,
         t.ticket_number,
         t.subject,
         t.description,
         t.priority,
         t.status,
         t.created_at,
         u.name AS customer_name,
         c.name AS category_name
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN ticket_categories c ON c.id = t.category_id
       WHERE t.assigned_to IS NULL
         AND t.status = 'Open'
       ORDER BY
         CASE t.priority
           WHEN 'Critical' THEN 1
           WHEN 'High' THEN 2
           WHEN 'Medium' THEN 3
           ELSE 4
         END,
         t.created_at ASC`
    );

    res.json({
      success: true,
      tickets: result.rows,
    });
  } catch (error) {
    console.error("Agent queue error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve available tickets",
    });
  }
};

exports.claimTicket = async (req, res) => {
  const client = await pool.connect();

  try {
    const ticketId = Number(req.params.id);

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID",
      });
    }

    await client.query("BEGIN");

    // Atomic condition prevents two agents claiming the same ticket.
    const result = await client.query(
      `UPDATE tickets
       SET assigned_to = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND assigned_to IS NULL
         AND status = 'Open'
       RETURNING id, ticket_number, subject, assigned_to, user_id`,
      [req.user.id, ticketId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Ticket is no longer available to claim",
      });
    }

    await client.query(
      `INSERT INTO ticket_assignments
         (ticket_id, agent_id, assigned_by)
       VALUES ($1, $2, $2)`,
      [ticketId, req.user.id]
    );

    await client.query(
      `INSERT INTO ticket_history
         (ticket_id, changed_by, action, old_value, new_value)
       VALUES ($1, $2, 'Ticket claimed', 'Unassigned', $3)`,
      [ticketId, req.user.id, String(req.user.id)]
    );
    await client.query(
      `INSERT INTO notifications
       (user_id, ticket_id, title, message, type)
       VALUES ($1, $2, 'Ticket Assigned', $3, 'info')`,
      [
        result.rows[0].user_id,
        ticketId,
        `An agent has been assigned to ticket ${result.rows[0].ticket_number}.`,
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Ticket claimed successfully",
      ticket: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Claim ticket error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to claim ticket",
    });
  } finally {
    client.release();
  }
};

// --------------------------------------------------
// DASHBOARD ANALYTICS
// --------------------------------------------------

exports.getAnalytics = async (req, res) => {
  try {
    const user = req.user;

    let filter = "";
    const params = [];

    if (user.role === "customer") {
      filter = "WHERE user_id = $1";
      params.push(user.id);
    } else if (user.role === "agent") {
      filter = "WHERE assigned_to = $1";
      params.push(user.id);
    } else if (!["admin", "manager"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Analytics are not available for this role",
      });
    }

    const statsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'Open')::int AS open,
         COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress,
         COUNT(*) FILTER (WHERE status = 'Resolved')::int AS resolved,
         COUNT(*) FILTER (WHERE status = 'Closed')::int AS closed,
         COUNT(*) FILTER (WHERE priority = 'Critical')::int AS critical
       FROM tickets
       ${filter}`,
      params
    );

    const statusResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM tickets
       ${filter}
       GROUP BY status
       ORDER BY status`,
      params
    );

    const priorityResult = await pool.query(
      `SELECT priority, COUNT(*)::int AS count
       FROM tickets
       ${filter}
       GROUP BY priority
       ORDER BY priority`,
      params
    );

    const trendResult = await pool.query(
      `SELECT
         TO_CHAR(month_start, 'Mon YYYY') AS month,
         count
       FROM (
         SELECT
           DATE_TRUNC('month', created_at) AS month_start,
           COUNT(*)::int AS count
         FROM tickets
         ${filter}
         ${filter ? "AND" : "WHERE"}
           created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
         GROUP BY DATE_TRUNC('month', created_at)
       ) monthly
       ORDER BY month_start`,
      params
    );

    res.json({
      success: true,
      stats: statsResult.rows[0],
      statusDistribution: statusResult.rows,
      priorityDistribution: priorityResult.rows,
      monthlyTrend: trendResult.rows,
    });
  } catch (error) {
    console.error("Analytics error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve dashboard analytics",
    });
  }
};