
const pool = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const emailService = require("../services/emailService");
const {
  createResetToken,
  hashResetToken,
  isValidNewPassword,
} = require("../services/passwordResetService");

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 30;
const RESET_REQUEST_MESSAGE =
  "If an active account with that email exists, a password reset link has been sent.";

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

// CUSTOMER REGISTRATION
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must contain 2 to 100 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (!isValidNewPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 12 characters and no more than 72 UTF-8 bytes",
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Public registration always creates a customer.
    // Never accept a role from req.body.
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING id, name, email, role, created_at`,
      [name.trim(), normalizedEmail, hashedPassword]
    );

    const user = result.rows[0];
    const token = createToken(user);

    return res.status(201).json({
      success: true,
      message: "Customer registered successfully",
      token,
      user,
    });
  } catch (error) {
    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

// USER LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, name, email, password, role, is_active
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact an administrator.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

// GET CURRENT LOGGED-IN USER
exports.getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, is_active, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        message: "User account not found or inactive",
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve profile",
    });
  }
};

exports.forgotPassword = async (req, res) => {
  const email =
    typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email address",
    });
  }

  try {
    emailService.getMailConfig();
  } catch (error) {
    console.error("Password reset email configuration error:", error.message);
    return res.status(503).json({
      success: false,
      message: "Password recovery email is not configured. Contact an administrator.",
    });
  }

  const client = await pool.connect();
  let transactionOpen = false;
  let tokenHash;
  let account;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const result = await client.query(
      `SELECT id, name, email
       FROM users
       WHERE email = $1 AND is_active = TRUE
       FOR UPDATE`,
      [email]
    );

    if (result.rows.length === 0) {
      await client.query("COMMIT");
      transactionOpen = false;
      return res.status(202).json({
        success: true,
        message: RESET_REQUEST_MESSAGE,
      });
    }

    account = result.rows[0];
    const token = createResetToken();
    tokenHash = hashResetToken(token);
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000
    );

    await client.query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1",
      [account.id]
    );
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [account.id, tokenHash, expiresAt]
    );
    await client.query("COMMIT");
    transactionOpen = false;

    try {
      await emailService.sendPasswordResetEmail({
        email: account.email,
        name: account.name,
        token,
      });
    } catch (error) {
      await pool.query(
        "DELETE FROM password_reset_tokens WHERE token_hash = $1",
        [tokenHash]
      );
      console.error("Password reset email delivery failed:", error.message);
      return res.status(503).json({
        success: false,
        message: "Unable to send the password reset email. Check mail settings and try again.",
      });
    }

    return res.status(202).json({
      success: true,
      message: RESET_REQUEST_MESSAGE,
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    console.error("Password reset request error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to process the password reset request",
    });
  } finally {
    client.release();
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (
    typeof token !== "string" ||
    token.length < 32 ||
    !isValidNewPassword(newPassword)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid reset link and a password of at least 12 characters are required",
    });
  }

  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const tokenResult = await client.query(
      `SELECT user_id, expires_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [hashResetToken(token)]
    );

    if (
      tokenResult.rows.length === 0 ||
      new Date(tokenResult.rows[0].expires_at).getTime() <= Date.now()
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or expired. Request a new link.",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const userId = tokenResult.rows[0].user_id;

    await client.query(
      "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [passwordHash, userId]
    );
    await client.query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1",
      [userId]
    );
    await client.query("COMMIT");
    transactionOpen = false;

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Sign in with your new password.",
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    console.error("Password reset error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to reset the password",
    });
  } finally {
    client.release();
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (
    typeof currentPassword !== "string" ||
    !isValidNewPassword(newPassword)
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter your current password and a new password of at least 12 characters",
    });
  }

  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const result = await client.query(
      `SELECT password
       FROM users
       WHERE id = $1 AND is_active = TRUE
       FOR UPDATE`,
      [req.user.id]
    );

    if (
      result.rows.length === 0 ||
      !(await bcrypt.compare(currentPassword, result.rows[0].password))
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    if (await bcrypt.compare(newPassword, result.rows[0].password)) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(400).json({
        success: false,
        message: "Choose a new password different from your current password",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await client.query(
      "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [passwordHash, req.user.id]
    );
    await client.query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1",
      [req.user.id]
    );
    await client.query("COMMIT");
    transactionOpen = false;

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    console.error("Password change error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to change the password",
    });
  } finally {
    client.release();
  }
};
