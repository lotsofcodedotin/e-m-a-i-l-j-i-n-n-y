require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const cron = require("node-cron");

const express = require("express");
const app = express();

const path = require("path");

const bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");

const frontendRouter = require("./routes/frontend");
const apiRouter = require("./routes/api");

const { authenticate, verified, subscribed } = require("./controller/auth");
const secerts = require("./controller/secrets");
const pool = require("./models/connection");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/public", express.static(__dirname + "/public"));

app.use(frontendRouter);
app.use("/api", apiRouter);

app.get("/", authenticate, verified, secerts, (req, res) => {
  res.sendFile(path.resolve("public/main.html"));
});

app.get("/public/assets/:campaign/:email/img.png", (req, res) => {
  // Extract email and campaign from query parameters
  const email = req.params.email;
  const campaign = req.params.campaign;
  const img = fs.readFileSync(path.resolve("public/assets/img/img.png"));
  const base64Image = img.toString("base64");
  try {
    axios
      .post(
        `https://app.emailjinny.com/api/track?email=${email}&campaign=${campaign}`
      )
      .catch((err) => console.error("Error while tracking:", err))
      .finally(function () {
        res.type("image/png").send(Buffer.from(base64Image, "base64"));
      });
  } catch (err) {
    console.log("something went wrong in tracking");
  }
});

app.listen(process.env.PORT, () => {
  console.log("running on port " + process.env.PORT);
});
