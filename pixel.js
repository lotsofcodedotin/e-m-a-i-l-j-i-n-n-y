const crypto = require("crypto");

function generateUniquePixel() {
  // Generate a random buffer (16 bytes for a 128-bit value)
  const randomBuffer = crypto.randomBytes(32);

  // Convert the buffer to a base64-encoded string
  const hex = randomBuffer.toString("hex");
  return hex.replace(/[^a-zA-Z0-9]/g, "x");
}

function generateToken() {
  // Generate a random buffer (16 bytes for a 128-bit value)
  const randomBuffer = crypto.randomBytes(32);

  // Convert the buffer to a base64-encoded string
  const hex = randomBuffer.toString("hex");
  return hex.replace(/[^a-zA-Z0-9]/g, "x");
}

function receipt(number) {
  // Generate a random buffer (16 bytes for a 128-bit value)
  const randomBuffer = crypto.randomBytes(number);

  // Convert the buffer to a base64-encoded string
  const hex = randomBuffer.toString("hex");
  return hex.replace(/[^a-zA-Z0-9]/g, "x");
}

module.exports = {
  generateUniquePixel,
  generateToken,
  receipt,
};
