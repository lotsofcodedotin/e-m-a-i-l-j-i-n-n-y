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
const { checkout, paymentVerification } = require("../controller/payment");

const { trackPOST, sendPOST } = require("../controller/api");
const { campaigns, campaign } = require("../controller/campaigns");

router
  .get("/", (req, res) => res.send("working"))
  .post("/track", trackPOST)
  .post("/send", authenticate, verified, secrets, subscribed, sendPOST)
  .post("/campaigns", authenticate, verified, campaigns)
  .get("/campaigns/:id", authenticate, verified, campaign);
// .post("/resell", authenticate, verified, resell)
// .get("/resells", authenticate, verified, resells);

router.route("/register").post(limiter, register);
router.route("/login").post(limiter, login);
router.route("/config").post(authenticate, config);
router.route("/verify").post(limiter, authenticate, verification);
router.route("/change-password").post(limiter, authenticate, changePassword);
router.route("/forget-password").post(limiter, forgetPassword);
router.route("/reset-password/:token").post(limiter, resetPassword);

router.route("/razorpaykey").get(authenticate, verified, (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

router.route("/checkout").post(limiter, authenticate, verified, checkout);
router
  .route("/payment-verification")
  .post(limiter, authenticate, verified, paymentVerification);

router
  .route("/my-plan")
  .get(authenticate, verified, subscribed, function (req, res) {
    if (req.user.subscribed) {
      res.status(200).json({ message: `${req.user.subscribed.plan}` });
    } else {
      res.status(200).json({ message: "FREE" });
    }
  });

module.exports = router;
