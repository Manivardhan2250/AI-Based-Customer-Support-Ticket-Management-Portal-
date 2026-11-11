const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createResetToken,
  hashResetToken,
  isValidNewPassword,
  createResetUrl,
} = require("../services/passwordResetService");
const { getMailConfig } = require("../services/emailService");

test("reset tokens are unique, URL-safe, and stored as one-way hashes", () => {
  const first = createResetToken();
  const second = createResetToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(hashResetToken(first), first);
  assert.equal(hashResetToken(first), hashResetToken(first));
});

test("password policy enforces minimum length and bcrypt byte limit", () => {
  assert.equal(isValidNewPassword("long-enough-password"), true);
  assert.equal(isValidNewPassword("short"), false);
  assert.equal(isValidNewPassword("😀".repeat(19)), false);
});

test("reset URL includes a token without discarding the configured path", () => {
  const url = new URL(createResetUrl("opaque_token", "https://support.example/app"));

  assert.equal(url.origin, "https://support.example");
  assert.equal(url.pathname, "/app");
  assert.equal(url.searchParams.get("token"), "opaque_token");
});

test("mail configuration fails explicitly when required settings are absent", () => {
  assert.throws(
    () => getMailConfig({}),
    /Missing email configuration: SMTP_HOST, SMTP_PORT, MAIL_FROM, FRONTEND_URL/
  );
});

test("mail configuration validates authentication and preserves secure SMTP settings", () => {
  const config = getMailConfig({
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "support@example.test",
    SMTP_PASSWORD: "test-only-password",
    MAIL_FROM: "SupportHub <support@example.test>",
    FRONTEND_URL: "https://support.example.test/",
  });

  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
  assert.deepEqual(config.auth, {
    user: "support@example.test",
    pass: "test-only-password",
  });
  assert.equal(config.frontendUrl, "https://support.example.test/");
  assert.throws(
    () => getMailConfig({
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      MAIL_FROM: "support@example.test",
      SMTP_USER: "support@example.test",
      FRONTEND_URL: "https://support.example.test/",
    }),
    /SMTP_USER and SMTP_PASSWORD must be configured together/
  );
});
