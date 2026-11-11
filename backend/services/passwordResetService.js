const crypto = require("node:crypto");

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const RESET_TOKEN_BYTES = 32;

function createResetToken() {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isValidNewPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

function createResetUrl(token, frontendUrl) {
  const url = new URL(frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

module.exports = {
  createResetToken,
  hashResetToken,
  isValidNewPassword,
  createResetUrl,
};
