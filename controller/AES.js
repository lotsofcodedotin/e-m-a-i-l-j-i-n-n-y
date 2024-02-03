const CryptoJS = require("crypto-js");

async function decryptUserData(encryptedData) {
  const encryptionKey = await CryptoJS.SHA256(
    process.env.ENCRYPTION_KEY
  ).toString();
  const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
  const decryptedData = decryptedBytes.toString(CryptoJS.enc.Utf8);
  return JSON.parse(decryptedData);
}

function replacePlaceholders(template, data) {
  return template.replace(/@\((\w+)\)/g, (match, key) => {
    const replacement = data[key] != undefined ? data[key] : match;
    return replacement;
  });
}

async function encryptUserData(data) {
  const encryptionKey = await CryptoJS.SHA256(
    process.env.ENCRYPTION_KEY
  ).toString();
  const encryptedData = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    encryptionKey
  ).toString();
  return encryptedData;
}

module.exports = {
  decryptUserData,
  encryptUserData,
  replacePlaceholders,
};
