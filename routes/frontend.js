const express = require("express");
const { authenticate, verified, subscribed } = require("../controller/auth");
const axios = require("axios");

const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 1000 * 60,
  max: 10,
  message: "you made too many requests, please try later",
});

const router = express.Router();
const path = require("path");
const { generation } = require("../controller/verification");

router.route("/login").get(limiter, function (req, res) {
  res.sendFile(path.resolve("public/login.html"));
});

router
  .route("/config")
  .get(authenticate, verified, subscribed, function (req, res) {
    res.sendFile(path.resolve("public/config.html"));
  });

router.route("/logout").get(function (req, res) {
  res.clearCookie("jwtToken");
  res.clearCookie("secrets");
  res.clearCookie("verified");
  res.clearCookie("subscribed");

  // Redirect to the desired page (you can customize the URL)
  res.redirect("/login");
});

router.route("/campaigns").get(authenticate, function (req, res) {
  res.sendFile(path.resolve("public/campaigns.html"));
});

router.route("/campaigns/:id").get(authenticate, function (req, res) {
  res.sendFile(path.resolve("public/campaign.html"));
});

router.route("/verification").get(limiter, authenticate, generation);
router.route("/verify").get(limiter, authenticate, (req, res) => {
  res.sendFile(path.resolve("public/verification.html"));
});

router.route("/subscribe").get(authenticate, verified, (req, res) => {
  res.sendFile(path.resolve("public/subscribe.html"));
});

router.route("/resell").get(authenticate, verified, subscribed, (req, res) => {
  res.sendFile(path.resolve("public/resell.html"));
});

router.route("/change-password").get((req, res) => {
  res.sendFile(path.resolve("public/changepass.html"));
});

router.route("/forget-password").get((req, res) => {
  res.sendFile(path.resolve("public/forgetpass.html"));
});

router.route("/reset-password/:token").get((req, res) => {
  res.sendFile(path.resolve("public/resetpass.html"));
});

module.exports = router;
