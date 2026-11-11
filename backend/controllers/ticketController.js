
const pool = require("../config/database");
const crypto = require("crypto");
const fs = require("fs/promises");


// Create a notification inside the current database transaction.
async function createNotification(
  client,
  userId,
  ticketId,
  title,
  message,
  type = "info"
) {
  if (!userId) return;

  await client.query(
    `INSERT INTO notifications
     (user_id, ticket_id, title, message, type)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, ticketId, title, message, type]
  );
}

// Notify all active administrators about a new ticket.
async function notifyAdmins(client, ticketId, ticketNumber) {
  await client.query(
    `INSERT INTO notifications
     (user_id, ticket_id, title, message, type)
     SELECT id, $1, $2, $3, $4
     FROM users
     WHERE role IN ('admin', 'manager') AND is_active = TRUE`,
    [
      ticketId,
      "New Support Ticket",
      `A new ticket ${ticketNumber} has been created.`,
      "info"
    ]
  );
}

async function removeUploadedFiles(files = []) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await fs.unlink(file.path);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Unable to remove uploaded file:", error.message);
        }
      }
    })
  );
}

// Generate a unique ticket number
function generateTicketNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `TKT-${date}-${random}`;
}

// Record ticket activity
async function recordHistory(client, ticketId, userId, action, oldValue = null, newValue = null) {
  await client.query(
    `INSERT INTO ticket_history
     (ticket_id, changed_by, action, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, userId, action, oldValue, newValue]
  );
}

// 1. CREATE TICKET - CUSTOMER
exports.createTicket = async (req, res) => {
  const { subject, description, category_id, priority } = req.body;
  const files = req.files || [];

  if (req.user.role !== "customer") {
    await removeUploadedFiles(files);
    return res.status(403).json({
      success: false,
      message: "Only customers can create tickets"
    });
  }

  if (typeof subject !== "string" || typeof description !== "string") {
    await removeUploadedFiles(files);
    return res.status(400).json({
      success: false,
      message: "Subject and description are required"
    });
  }

  if (
    subject.trim().length < 3 ||
    subject.trim().length > 200 ||
    !description.trim() ||
    description.trim().length > 10000
  ) {
    await removeUploadedFiles(files);
    return res.status(400).json({
      success: false,
      message: "Invalid subject or description"
    });
  }

  const validPriorities = ["Low", "Medium", "High", "Critical"];

  if (category_id === undefined || category_id === null || category_id === "") {
    await removeUploadedFiles(files);
    return res.status(400).json({
      success: false,
      message: "A ticket category is required",
    });
  }

  if (priority && !validPriorities.includes(priority)) {
    await removeUploadedFiles(files);
    return res.status(400).json({
      success: false,
      message: "Invalid ticket priority"
    });
  }
  const suggestedCategory = req.body.ai_suggested_category ?? null;
  const suggestedPriority = req.body.ai_suggested_priority ?? null;
  if (
    (suggestedCategory !== null &&
      (typeof suggestedCategory !== "string" || suggestedCategory.length > 100)) ||
    (suggestedPriority !== null && !validPriorities.includes(suggestedPriority))
  ) {
    await removeUploadedFiles(files);
    return res.status(400).json({
      success: false,
      message: "Invalid AI suggestion metadata",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (category_id !== undefined && category_id !== null) {
      if (!Number.isInteger(Number(category_id)) || Number(category_id) <= 0) {
        await client.query("ROLLBACK");
        await removeUploadedFiles(files);
        return res.status(400).json({
          success: false,
          message: "Invalid category ID"
        });
      }

      const category = await client.query(
        `SELECT id FROM ticket_categories
         WHERE id = $1 AND is_active = TRUE`,
        [Number(category_id)]
      );

      if (category.rows.length === 0) {
        await client.query("ROLLBACK");
        await removeUploadedFiles(files);
        return res.status(400).json({
          success: false,
          message: "Invalid or inactive category"
        });
      }
    }

    const ticketNumber = generateTicketNumber();
    const result = await client.query(
      `INSERT INTO tickets
       (ticket_number, user_id, category_id, subject, description, priority,
        ai_suggested_category, ai_suggested_priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        ticketNumber,
        req.user.id,
        category_id || null,
        subject.trim(),
        description.trim(),
        priority || "Medium",
        suggestedCategory,
        suggestedPriority
      ]
    );

    const ticket = result.rows[0];
    for (const file of files) {
      await client.query(
        `INSERT INTO ticket_attachments
         (ticket_id, uploaded_by, file_name, stored_name, file_path, mime_type, file_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          ticket.id,
          req.user.id,
          file.originalname,
          file.filename,
          file.path,
          file.mimetype,
          file.size,
        ]
      );
    }

    await recordHistory(
      client,
      ticket.id,
      req.user.id,
      "Ticket Created",
      null,
      ticket.ticket_number
    );
    await notifyAdmins(
        client,
        ticket.id,
        ticket.ticket_number
    );
    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Ticket created successfully",
      ticket
    });

  } catch (error) {
    await client.query("ROLLBACK");
    await removeUploadedFiles(files);
    console.error("Create ticket error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to create ticket"
    });
  } finally {
    client.release();
  }
};

// 2. GET ALL ACCESSIBLE TICKETS
exports.getTickets = async (req, res) => {
  try {
    const { status, priority, search } = req.query;

    const validStatuses = ["Open", "In Progress", "Resolved", "Closed"];
    const validPriorities = ["Low", "Medium", "High", "Critical"];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket status"
      });
    }

    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket priority"
      });
    }

    let query = `
      SELECT
        t.*,
        u.name AS customer_name,
        u.email AS customer_email,
        a.name AS agent_name,
        c.name AS category_name
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN users a ON t.assigned_to = a.id
      LEFT JOIN ticket_categories c ON t.category_id = c.id
      WHERE 1 = 1
    `;

    const values = [];

    if (req.user.role === "customer") {
      values.push(req.user.id);
      query += ` AND t.user_id = $${values.length}`;

    } else if (req.user.role === "agent") {
      values.push(req.user.id);
      query += ` AND t.assigned_to = $${values.length}`;

    } else if (!["admin", "manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You cannot view tickets"
      });
    }

    if (status) {
      values.push(status);
      query += ` AND t.status = $${values.length}`;
    }

    if (priority) {
      values.push(priority);
      query += ` AND t.priority = $${values.length}`;
    }

    if (search !== undefined) {
      if (typeof search !== "string" || search.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Search text cannot exceed 100 characters",
        });
      }
      values.push(`%${search.trim()}%`);
      query += ` AND (t.ticket_number ILIKE $${values.length}
        OR t.subject ILIKE $${values.length}
        OR u.name ILIKE $${values.length})`;
    }

    query += " ORDER BY t.created_at DESC";

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      tickets: result.rows
    });

  } catch (error) {
    console.error("Get tickets error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tickets"
    });
  }
};


// 3. GET SINGLE TICKET
exports.getTicketById = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID"
      });
    }

    const result = await pool.query(
      `SELECT
        t.*,
        u.name AS customer_name,
        u.email AS customer_email,
        a.name AS agent_name,
        c.name AS category_name
       FROM tickets t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       LEFT JOIN ticket_categories c ON t.category_id = c.id
       WHERE t.id = $1`,
      [ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    const ticket = result.rows[0];

    const allowed =
      ["admin", "manager"].includes(req.user.role) ||
      (req.user.role === "customer" && ticket.user_id === req.user.id) ||
      (req.user.role === "agent" &&
        (ticket.assigned_to === req.user.id ||
          (ticket.assigned_to === null && ticket.status === "Open")));

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You cannot access this ticket"
      });
    }

    const history = await pool.query(
      `SELECT h.*, u.name AS changed_by_name
       FROM ticket_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.ticket_id = $1
       ORDER BY h.created_at DESC`,
      [ticketId]
    );
    const attachments = await pool.query(
      `SELECT id, ticket_id, uploaded_by, file_name, mime_type, file_size, uploaded_at
       FROM ticket_attachments
       WHERE ticket_id = $1
       ORDER BY uploaded_at`,
      [ticketId]
    );
    const escalations = await pool.query(
      `SELECT e.id, e.reason, e.status, e.created_at, u.name AS escalated_by_name
       FROM ticket_escalations e
       JOIN users u ON u.id = e.escalated_by
       WHERE e.ticket_id = $1
       ORDER BY e.created_at DESC`,
      [ticketId]
    );
    const feedback = await pool.query(
      `SELECT rating, comments, created_at
       FROM ticket_feedback
       WHERE ticket_id = $1`,
      [ticketId]
    );

    return res.status(200).json({
      success: true,
      ticket,
      history: history.rows,
      attachments: attachments.rows,
      escalations: escalations.rows,
      feedback: feedback.rows[0] || null,
    });

  } catch (error) {
    console.error("Get ticket error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve ticket"
    });
  }
};

exports.downloadAttachment = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);
    if (
      !Number.isInteger(ticketId) ||
      ticketId <= 0 ||
      !Number.isInteger(attachmentId) ||
      attachmentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket or attachment ID",
      });
    }

    const result = await pool.query(
      `SELECT a.file_name, a.file_path, t.user_id, t.assigned_to
       FROM ticket_attachments a
       JOIN tickets t ON t.id = a.ticket_id
       WHERE a.id = $1 AND a.ticket_id = $2`,
      [attachmentId, ticketId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    const attachment = result.rows[0];
    const canAccess =
      ["admin", "manager"].includes(req.user.role) ||
      (req.user.role === "customer" &&
        Number(attachment.user_id) === Number(req.user.id)) ||
      (req.user.role === "agent" &&
        Number(attachment.assigned_to) === Number(req.user.id));
    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this attachment",
      });
    }

    return res.download(attachment.file_path, attachment.file_name, (error) => {
      if (error && !res.headersSent) {
        console.error("Attachment download error:", error.message);
        res.status(404).json({
          success: false,
          message: "Attachment file is unavailable",
        });
      }
    });
  } catch (error) {
    console.error("Attachment download error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to download attachment",
    });
  }
};


// 4. UPDATE TICKET
exports.updateTicket = async (req, res) => {
  const ticketId = Number(req.params.id);
  const { subject, description, category_id, priority, status } = req.body;

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid ticket ID"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ticketResult = await client.query(
      "SELECT * FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    const oldTicket = ticketResult.rows[0];

    const allowed =
      ["admin", "manager"].includes(req.user.role) ||
      (req.user.role === "customer" && oldTicket.user_id === req.user.id) ||
      (req.user.role === "agent" && oldTicket.assigned_to === req.user.id);

    if (!allowed) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "You cannot update this ticket"
      });
    }

    const updates = {};

    if (subject !== undefined) {
      if (req.user.role === "agent" ||
          typeof subject !== "string" ||
          subject.trim().length < 3 ||
          subject.trim().length > 200) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid subject or insufficient permission"
        });
      }
      updates.subject = subject.trim();
    }

    if (description !== undefined) {
      if (req.user.role === "agent" ||
          typeof description !== "string" ||
          !description.trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid description or insufficient permission"
        });
      }
      updates.description = description.trim();
    }

    if (category_id !== undefined) {
      if (req.user.role === "agent") {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Agents cannot change ticket categories"
        });
      }

      if (category_id !== null) {
        if (!Number.isInteger(Number(category_id)) || Number(category_id) <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Invalid category ID"
          });
        }

        const category = await client.query(
          `SELECT id FROM ticket_categories
           WHERE id = $1 AND is_active = TRUE`,
          [Number(category_id)]
        );

        if (category.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Invalid or inactive category"
          });
        }
      }

      updates.category_id = category_id === null ? null : Number(category_id);
    }

    if (priority !== undefined) {
      if (req.user.role === "customer" ||
          !["Low", "Medium", "High", "Critical"].includes(priority)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid priority or insufficient permission"
        });
      }
      updates.priority = priority;
    }

    if (status !== undefined) {
      if (req.user.role === "customer" ||
          !["Open", "In Progress", "Resolved"].includes(status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid status or insufficient permission; customers confirm resolution separately"
        });
      }

      if (oldTicket.status === "Closed") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Closed tickets cannot be changed"
        });
      }
      if (oldTicket.status === "Resolved" && status !== "Resolved") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "The customer must confirm or reopen a resolved ticket"
        });
      }

      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update"
      });
    }

    const fields = Object.keys(updates);
    const values = fields.map(field => updates[field]);

    const setClauses = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );

    if (updates.status === "Resolved" && oldTicket.status !== "Resolved") {
      setClauses.push("resolved_at = CURRENT_TIMESTAMP");
    }

    if (updates.status === "Open" || updates.status === "In Progress") {
      if (oldTicket.status === "Resolved") {
        setClauses.push("resolved_at = NULL");
      }
    }

    setClauses.push("updated_at = CURRENT_TIMESTAMP");

    values.push(ticketId);

    const updatedResult = await client.query(
      `UPDATE tickets
       SET ${setClauses.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    for (const field of fields) {
      if (String(oldTicket[field]) !== String(updates[field])) {
        await recordHistory(
          client,
          ticketId,
          req.user.id,
          `${field} Updated`,
          oldTicket[field] === null ? null : String(oldTicket[field]),
          updates[field] === null ? null : String(updates[field])
        );
      }
    }

// Notify the customer when ticket status changes.
    if (
        updates.status !== undefined &&
        oldTicket.status !== updates.status
    ) {
    await createNotification(
        client,
        oldTicket.user_id,
        ticketId,
        "Ticket Status Updated",
        `Your ticket ${oldTicket.ticket_number} status changed from ${oldTicket.status} to ${updates.status}.`,
        "info"
        );
    }

// Notify relevant users when ticket priority changes.
    if (
        updates.priority !== undefined &&
        oldTicket.priority !== updates.priority
    ) {
    await createNotification(
        client,
        oldTicket.user_id,
        ticketId,
        "Ticket Priority Updated",
        `Your ticket ${oldTicket.ticket_number} priority changed to ${updates.priority}.`,
        "info"
    );

    if (
        oldTicket.assigned_to &&
        oldTicket.assigned_to !== req.user.id
    ) {
        await createNotification(
        client,
        oldTicket.assigned_to,
        ticketId,
        "Ticket Priority Changed",
        `The priority of ticket ${oldTicket.ticket_number} changed to ${updates.priority}.`,
        "info"
            );
        }
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Ticket updated successfully",
      ticket: updatedResult.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update ticket error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update ticket"
    });
  } finally {
    client.release();
  }
};

exports.confirmResolution = async (req, res) => {
  const ticketId = Number(req.params.id);
  const { action } = req.body;

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid ticket ID",
    });
  }
  if (!["close", "reopen"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Action must be close or reopen",
    });
  }
  if (req.user.role !== "customer") {
    return res.status(403).json({
      success: false,
      message: "Only the ticket customer can confirm or reopen a resolved ticket",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT * FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const ticket = result.rows[0];
    if (Number(ticket.user_id) !== Number(req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "You cannot confirm another customer's ticket",
      });
    }
    if (ticket.status !== "Resolved") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Only resolved tickets can be confirmed or reopened",
      });
    }

    const nextStatus = action === "close" ? "Closed" : "In Progress";
    const updated = await client.query(
      `UPDATE tickets
       SET status = $1,
           closed_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
           resolved_at = CASE WHEN $2 THEN resolved_at ELSE NULL END,
           customer_confirmed_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [nextStatus, action === "close", ticketId]
    );

    await recordHistory(
      client,
      ticketId,
      req.user.id,
      action === "close" ? "Customer Confirmed Resolution" : "Customer Reopened Ticket",
      "Resolved",
      nextStatus
    );
    if (ticket.assigned_to) {
      await createNotification(
        client,
        ticket.assigned_to,
        ticketId,
        action === "close" ? "Ticket Closed" : "Ticket Reopened",
        `Ticket ${ticket.ticket_number} was ${action === "close" ? "confirmed and closed" : "reopened"} by the customer.`,
        "info"
      );
    }

    await client.query("COMMIT");
    return res.json({
      success: true,
      message: action === "close" ? "Ticket closed successfully" : "Ticket reopened successfully",
      ticket: updated.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Ticket resolution confirmation error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update ticket resolution",
    });
  } finally {
    client.release();
  }
};


// 5. ASSIGN TICKET TO AN AGENT
exports.assignTicket = async (req, res) => {
  const ticketId = Number(req.params.id);
  const { agent_id } = req.body;

  if (!Number.isInteger(ticketId) || ticketId <= 0 ||
      !Number.isInteger(Number(agent_id)) || Number(agent_id) <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid ticket ID and agent ID are required"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ticketResult = await client.query(
      "SELECT * FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    const agentResult = await client.query(
      `SELECT id FROM users
       WHERE id = $1 AND role = 'agent' AND is_active = TRUE`,
      [Number(agent_id)]
    );

    if (agentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Active agent not found"
      });
    }

    const oldAgent = ticketResult.rows[0].assigned_to;

    if (oldAgent === Number(agent_id)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Ticket is already assigned to this agent"
      });
    }

    if (oldAgent !== null) {
      await client.query(
        `UPDATE ticket_assignments
         SET unassigned_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $1 AND agent_id = $2
         AND unassigned_at IS NULL`,
        [ticketId, oldAgent]
      );
    }

    await client.query(
      `INSERT INTO ticket_assignments
       (ticket_id, agent_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [ticketId, Number(agent_id), req.user.id]
    );

    const updated = await client.query(
      `UPDATE tickets
       SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [Number(agent_id), ticketId]
    );

    await recordHistory(
      client,
      ticketId,
      req.user.id,
      "Agent Assigned",
      oldAgent === null ? null : String(oldAgent),
      String(agent_id)
    );
    await createNotification(
        client,
        Number(agent_id),
        ticketId,
        "New Ticket Assigned",
        `Ticket ${updated.rows[0].ticket_number} has been assigned to you.`,
        "info"
    );

    await createNotification(
        client,
        ticketResult.rows[0].user_id,
        ticketId,
        "Ticket Assigned",
        `An agent has been assigned to ticket ${updated.rows[0].ticket_number}.`,
        "info"
    );

    await client.query("COMMIT");
    return res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
      ticket: updated.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Assign ticket error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to assign ticket"
    });
  } finally {
    client.release();
  }
};


// 6. DELETE TICKET - ADMIN ONLY
exports.deleteTicket = async (req, res) => {
  const ticketId = Number(req.params.id);

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid ticket ID"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT id, ticket_number FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    const attachments = await client.query(
      "SELECT file_path FROM ticket_attachments WHERE ticket_id = $1",
      [ticketId]
    );
    await client.query(
      "DELETE FROM tickets WHERE id = $1",
      [ticketId]
    );

    await client.query("COMMIT");
    await removeUploadedFiles(
      attachments.rows.map((attachment) => ({ path: attachment.file_path }))
    );

    return res.status(200).json({
      success: true,
      message: "Ticket deleted successfully",
      ticket_number: result.rows[0].ticket_number
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete ticket error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to delete ticket"
    });
  } finally {
    client.release();
  }
};
