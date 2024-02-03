const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 1000 * 60,
  max: 10,
  message: "you made too many requests, please try later",
});

const {
  register,
  login,
  config,
  resell,
  resells,
  changePassword,
  forgetPassword,
  resetPassword,
} = require("../controller/user");
const { authenticate, verified, subscribed } = require("../controller/auth");
const { verification } = require("../controller/verification.js");
const secrets = require("../controller/secrets");

const { trackPOST, sendPOST } = require("../controller/api");
const { campaigns, campaign } = require("../controller/campaigns");

router
  .get("/", (req, res) => res.send("working"))
  .post("/track", trackPOST)
  .post("/send", authenticate, verified, subscribed, secrets, sendPOST)
  .post("/campaigns", authenticate, verified, campaigns)
  .get("/campaigns/:id", authenticate, verified, campaign)
  .post("/resell", authenticate, verified, subscribed, resell)
  .get("/resells", authenticate, verified, subscribed, resells);

router.route("/register").post(limiter, register);
router.route("/login").post(limiter, login);
router.route("/config").post(authenticate, config);
router.route("/verify").post(limiter, authenticate, verification);
router.route("/change-password").post(limiter, authenticate, changePassword);
router.route("/forget-password").post(limiter, forgetPassword);
router.route("/reset-password/:token").post(limiter, resetPassword);

module.exports = router;
