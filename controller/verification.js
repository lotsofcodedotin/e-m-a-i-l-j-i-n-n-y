const pool = require("../models/connection");
const jwt = require("jsonwebtoken");
const { generateUniquePixel } = require("../pixel");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

async function generation(req, res) {
  var otp_to_send;
  try {
    const otp_id = await generateUniquePixel();
    otp_to_send = await generateOTP();
    const emailSubject = `Email verification code: ${otp_to_send} for EmailJinny account.`;
    const message = `Verify your email address 
EmailJinny received a request to use ${req.user.email} as main email for EmailJinny Account 
Use this code to finish setting up this recovery email: ${otp_to_send}

This code will expire in 10 minutes.

If you don’t recognize this activity, you can safely ignore this email.`;
    var otp_to_store = await bcrypt.hashSync(otp_to_send, 10);

    const query = "insert into user_otp (email,	otp, id) values (?, ?, ?);";
    const values = [req.user.email, otp_to_store, otp_id];
    const [result] = await pool.promise().execute(query, values);

    let transporter = await nodemailer.createTransport({
      host: process.env.TRANSPORTER_HOST,
      port: process.env.TRANSPORTER_PORT,
      secure: true,
      auth: {
        user: process.env.FROM,
        pass: process.env.PASS,
      },
    });
    const info = await transporter.sendMail({
      from: process.env.FROM,
      to: req.user.email,
      subject: emailSubject,
      html: `<pre style="font-family: sans-serif;">${message}</pre>`,
    });
    transporter.close();
    return res.redirect(`/verify?id=${otp_id}`);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "internal server error" });
  }
}

async function verification(req, res) {
  try {
    var otp_from_frontend = req.body.otp;
    console.log(`otp from frontend: ${otp_from_frontend}`);
    var otp_id = req.body.id;
    var query = "select * from user_otp where id = ? and email = ?;";
    var values = [otp_id, req.user.email];
    const [result] = await pool.promise().execute(query, values);
    console.log(result);
    const verified = bcrypt.compareSync(otp_from_frontend, result[0].otp);

    if (!verified) {
      return res.status(401).json({ message: "otp invalid" });
    }
    if (!(new Date(result[0].expiry) > new Date())) {
      return res.status(401).json({ message: "otp expired" });
    }

    var verificationQuery = "update users set verified = true where email = ?";
    var verificationValues = [req.user.email];

    var [verificationQueryResult] = await pool
      .promise()
      .execute(verificationQuery, verificationValues);
    const verifiedJWT = jwt.sign({ verified: true }, process.env.JWT_SECRET);

    // Return the token and user data

    res.cookie("verified", verifiedJWT, {
      httpOnly: true,
      secure: true,
    });

    return res.redirect("/");
  } catch (err) {
    console.error(err);
  }
}

function generateOTP() {
  // Generate a random 4-digit number
  const otp = Math.floor(1000 + Math.random() * 9000);
  return otp.toString(); // Convert to string for a 4-digit number
}

module.exports = {
  generation,
  verification,
};
