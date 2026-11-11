const nodemailer = require("nodemailer");
const { createResetUrl } = require("./passwordResetService");

function getMailConfig(env = process.env) {
  const required = ["SMTP_HOST", "SMTP_PORT", "MAIL_FROM", "FRONTEND_URL"];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  }

  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port");
  }

  const smtpUser = env.SMTP_USER?.trim();
  const smtpPassword = env.SMTP_PASSWORD;
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
  }

  const secureValue = env.SMTP_SECURE?.trim().toLowerCase();
  if (secureValue && !["true", "false"].includes(secureValue)) {
    throw new Error("SMTP_SECURE must be true or false");
  }

  let frontendUrl;
  try {
    frontendUrl = new URL(env.FRONTEND_URL);
  } catch {
    throw new Error("FRONTEND_URL must be a valid absolute URL");
  }

  if (!["http:", "https:"].includes(frontendUrl.protocol)) {
    throw new Error("FRONTEND_URL must use HTTP or HTTPS");
  }

  return {
    host: env.SMTP_HOST.trim(),
    port,
    secure: secureValue ? secureValue === "true" : port === 465,
    auth: smtpUser
      ? { user: smtpUser, pass: smtpPassword }
      : undefined,
    from: env.MAIL_FROM.trim(),
    frontendUrl: frontendUrl.toString(),
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function sendPasswordResetEmail({ email, name, token }) {
  const config = getMailConfig();
  const resetUrl = createResetUrl(token, config.frontendUrl);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
  const safeName = escapeHtml(name || "there");

  await transport.sendMail({
    from: config.from,
    to: email,
    subject: "Reset your SupportHub password",
    text: `Hello ${name || "there"},\n\nUse this link within 30 minutes to reset your SupportHub password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hello ${safeName},</p><p>Use this link within 30 minutes to reset your SupportHub password:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}

module.exports = { getMailConfig, sendPasswordResetEmail };
