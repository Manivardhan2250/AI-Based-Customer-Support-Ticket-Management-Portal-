
require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { isValidNewPassword } = require("../services/passwordResetService");

async function createAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD before running this script."
    );
  }

  if (!isValidNewPassword(ADMIN_PASSWORD)) {
    throw new Error("Admin password must contain at least 12 characters and no more than 72 UTF-8 bytes.");
  }

  const email = ADMIN_EMAIL.trim().toLowerCase();

  const existing = await pool.query(
    "SELECT id, role FROM users WHERE email = $1",
    [email]
  );

  if (existing.rows.length > 0) {
    throw new Error(
      `An account with this email already exists (role: ${existing.rows[0].role}). No changes made.`
    );
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const result = await pool.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id, name, email, role`,
    [ADMIN_NAME.trim(), email, hashedPassword]
  );

  console.log("Administrator created successfully:");
  console.log(result.rows[0]);
}

createAdmin()
  .catch((error) => {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
