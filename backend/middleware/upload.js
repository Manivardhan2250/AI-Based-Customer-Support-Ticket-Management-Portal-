const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const uploadDirectory = path.resolve(
  __dirname,
  "..",
  process.env.UPLOAD_DIR || "uploads"
);
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename(req, file, callback) {
    callback(null, `${crypto.randomBytes(24).toString("hex")}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error("Unsupported attachment type"));
    }
    return callback(null, true);
  },
});

module.exports = { upload, uploadDirectory };
