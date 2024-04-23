const pixel = require("../pixel");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const pool = require("../models/connection");
const {
  decryptUserData,
  replacePlaceholders,
  encryptUserData,
} = require("./AES");
const mime = require("mime-types");

const createDOMPurify = require("dompurify");

const { JSDOM } = require("jsdom");

function trackPOST(req, res) {
  console.log(
    "email opened:",
    req.query.email,
    "campaign:",
    req.query.campaign
  );

  try {
    const Query = `insert into opened (campaign_id, receiver) VALUES (?,?);`;

    Values = [req.query.campaign, req.query.email];

    pool.execute(Query, Values, (err, results) => {
      if (!err) {
        return res.status(200).json({ message: "Campaign Report Updated" });
      }
      return res.status(500).json({ error: "Error Updating Campign Report" });
    });
  } catch (err) {
    return res.status(500).json({
      error:
        "Error Sending While Email, Please Check your congistration or Try again later.",
    });
  }
}

async function sendPOST(req, res) {
  try {
    if (req.user.subscribed == false) {
      await sendEmailWithBrand(req, res);
    } else {
      await sendEmailWithoutBrand(req, res);
    }
  } catch (err) {
    console.error("Error sending emails:", err);
    return res.status(500).json({ success: false, error: "Server Error" });
  }
}

async function sendEmailWithoutBrand(req, res) {
  try {
    var { to, subject, message, attachments } = req.body;
    let oneSend = false;
    const window = new JSDOM("").window;
    const DOMPurify = createDOMPurify(window);
    message = DOMPurify.sanitize(message);
    if (attachments) {
      var attachmentData = attachments.data.split(",");

      // Extract the data type (e.g., "image/png")
      var mimeType = attachmentData[0].split(":")[1].split(";")[0];
      var fileExtension = mime.extension(mimeType);
      attachments = [
        {
          content: Buffer.from(attachmentData[1], "base64"),
          filename: `${attachments.filename.split(".")[0]}.${fileExtension}`,
          encoding: "base64",
        },
      ];
    } else {
      attachments = [];
    }

    to = JSON.parse(to);

    if (to.length <= 0) {
      throw new Error("must have at least one email address");
    }
    const campaign_id = await pixel.generateUniquePixel();
    const campaign_report = {
      id: campaign_id,
      total_sent: to.length,
      sent: [],
      bounced: [],
      error: [],
    };

    const secrets = req.user.secrets;
    if (!secrets) {
      return res.redirect("/config");
    }

    const { host, email, password, port, secure, max, exactName } =
      req.user.secrets;
    const decryptedHost = await decryptUserData(host);
    const decryptedPort = await decryptUserData(port);
    // const decryptedSecure = await decryptUserData(secure);
    const decryptedPassword = await decryptUserData(password);
    const decryptedEmail = await decryptUserData(email);
    const maxRatePerMinute = await decryptUserData(max);
    const fullName = (await decryptUserData(exactName)) || null;

    let transporter = nodemailer.createTransport({
      pool: true,
      host: decryptedHost,
      port: decryptedPort,
      auth: {
        user: decryptedEmail,
        pass: decryptedPassword,
      },
      tls: {
        // do not fail on invalid certs
        rejectUnauthorized: false,
      },
      rateDelta: 60000,
      rateLimit: maxRatePerMinute || 5,
      maxConnections: 1,
    });

    // Insert initial campaign details into the database
    const startQuery = `INSERT INTO campaign (campaign_id, sender, status, total_emails) VALUES (?, ?, ?, ?);`;
    const startValues = [
      campaign_id,
      req.user.email,
      "started",
      "" + to.length,
    ];
    await pool.promise().execute(startQuery, startValues);

    function oneSent() {
      res.status(200).json({
        success: true,
        message:
          "Emails Queued successfully - it generally takes about 2.5 hours to send and update 1000 emails campaign. you take a break, Have a kitkat.",
      });
    }

    // Send emails to multiple recipients
    for (const recipientObject of to) {
      try {
        // Ensure recipientObject is not empty
        if (!recipientObject) {
          throw new Error("Recipient object is empty.");
        }

        // Extract email address from recipientObject
        var emailValue = recipientObject[Object.keys(recipientObject)[0]];

        // Ensure emailValue is defined
        if (!emailValue) {
          throw new Error("Recipient email address is empty.");
        }

        var emailSubject = replacePlaceholders(subject, recipientObject);
        var emailMessage = replacePlaceholders(message, recipientObject);
        let secretEmail = await encryptUserData(emailValue);
        secretEmail.replaceAll("/", "@");
        let secretCampaignId = await encryptUserData(campaign_id);
        secretCampaignId = secretCampaignId.replaceAll("/", "@");

        var html = `<html><head><style>
  @import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
          *{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          </style></head><body>
            <div>
              ${emailMessage}
            </div>
            </body></html>`;
        // send next message from the pending queue
        const info = await transporter.sendMail({
          from:
            fullName == null
              ? `${decryptedEmail}`
              : `${fullName} <${decryptedEmail}>`,
          to: emailValue,
          subject: emailSubject,
          html: html,
          attachments: attachments.length > 0 ? attachments : null,
        });

        if (info.accepted && info.accepted.length > 0) {
          campaign_report.sent.push(info);
          if (!oneSend) {
            oneSent();
            oneSend = true;
          }
          var sentQuery = `insert into sent (campaign_id, receiver) VALUES (?,?);`;
          var sentValues = [campaign_id, emailValue];
          await pool.promise().execute(sentQuery, sentValues);
        } else if (info.rejected && info.rejected.length > 0) {
          campaign_report.bounced.push(info);
          var bouncedQuery = `insert into bounced (campaign_id, receiver) VALUES (?,?);`;
          var bouncedValues = [campaign_id, emailValue];
          await pool.promise().execute(bouncedQuery, bouncedValues);
        } else {
          campaign_report.error.push({ info, receiver: emailValue });
          var bouncedQuery = `insert into bounced (campaign_id, receiver) VALUES (?,?);`;
          var bouncedValues = [campaign_id, emailValue];
          await pool.promise().execute(bouncedQuery, bouncedValues);
        }
      } catch (err) {
        console.log(err);
        if (err.responseCode === 535) {
          const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
          const updateValues = ["failed", campaign_id];
          await pool.promise().execute(updateQuery, updateValues);
          return res.status(535).json({
            error: "Bad Authentication",
          });
        } else {
          const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
          const updateValues = ["failed", campaign_id];
          await pool.promise().execute(updateQuery, updateValues);
          console.error(err);
          return res.status(403).json({
            error: "Something went wrong from Your Side",
          });
        }
      }
    }

    // Update campaign status in the database
    const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
    const updateValues = ["completed", campaign_id];
    await pool.promise().execute(updateQuery, updateValues);

    // Process sent and bounced recipients
    transporter.close();
  } catch (err) {
    res.status(500).json({ error: err });
  }
}

async function sendEmailWithBrand(req, res) {
  try {
    var { to, subject, message, attachments } = req.body;
    let oneSend = false;
    const window = new JSDOM("").window;
    const DOMPurify = createDOMPurify(window);
    message = DOMPurify.sanitize(message);
    if (attachments) {
      var attachmentData = attachments.data.split(",");

      // Extract the data type (e.g., "image/png")
      var mimeType = attachmentData[0].split(":")[1].split(";")[0];
      var fileExtension = mime.extension(mimeType);
      attachments = [
        {
          content: Buffer.from(attachmentData[1], "base64"),
          filename: `${attachments.filename.split(".")[0]}.${fileExtension}`,
          encoding: "base64",
        },
      ];
    } else {
      attachments = [];
    }

    to = JSON.parse(to);

    if (to.length <= 0) {
      throw new Error("must have at least one email address");
    }
    const campaign_id = await pixel.generateUniquePixel();
    const campaign_report = {
      id: campaign_id,
      total_sent: to.length,
      sent: [],
      bounced: [],
      error: [],
    };

    const secrets = req.user.secrets;
    if (!secrets) {
      return res.redirect("/config");
    }

    const { host, email, password, port, secure, max, exactName } =
      req.user.secrets;
    const decryptedHost = await decryptUserData(host);
    const decryptedPort = await decryptUserData(port);
    const decryptedSecure = await decryptUserData(secure);
    const decryptedPassword = await decryptUserData(password);
    const decryptedEmail = await decryptUserData(email);
    const maxRatePerMinute = await decryptUserData(max);
    const fullName = (await decryptUserData(exactName)) || null;

    let transporter = nodemailer.createTransport({
      pool: true,
      host: decryptedHost,
      port: decryptedPort,
      secure: decryptedSecure,
      auth: {
        user: decryptedEmail,
        pass: decryptedPassword,
      },
      rateDelta: 60000,
      rateLimit: maxRatePerMinute || 5,
      maxConnections: 1,
    });

    // Insert initial campaign details into the database
    const startQuery = `INSERT INTO campaign (campaign_id, sender, status, total_emails) VALUES (?, ?, ?, ?);`;
    const startValues = [
      campaign_id,
      req.user.email,
      "started",
      "" + to.length,
    ];
    await pool.promise().execute(startQuery, startValues);

    function oneSent() {
      res.status(200).json({
        success: true,
        message:
          "Emails Queued successfully - it generally takes about 2.5 hours to send and update 1000 emails campaign. you take a break, Have a kitkat.",
      });
    }

    // Send emails to multiple recipients
    for (const recipientObject of to) {
      try {
        // Ensure recipientObject is not empty
        if (!recipientObject) {
          throw new Error("Recipient object is empty.");
        }

        // Extract email address from recipientObject
        var emailValue = recipientObject[Object.keys(recipientObject)[0]];

        // Ensure emailValue is defined
        if (!emailValue) {
          throw new Error("Recipient email address is empty.");
        }

        var emailSubject = replacePlaceholders(subject, recipientObject);
        var emailMessage = replacePlaceholders(message, recipientObject);

        var html = `<html><head><style>
  @import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
          *{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          </style></head><body>
            <div style="width: 100%; line-height: 2; padding: 30px;">
              ${emailMessage}
              <div style="text-align: center; padding: 40px">
                <h6 style="color: #d90429;font-size:10px; font-family:'Roboto', sans-sarif;">send unlimited free email with 💝emailjinny</h6>
              </a>            
              </div>
            </div>
            </body></html>`;
        // send next message from the pending queue
        const info = await transporter.sendMail({
          from:
            fullName == null
              ? `${decryptedEmail}`
              : `${fullName} <${decryptedEmail}>`,
          to: emailValue,
          subject: emailSubject,
          html: html,
          attachments: attachments.length > 0 ? attachments : null,
        });

        if (info.accepted && info.accepted.length > 0) {
          campaign_report.sent.push(info);
          if (!oneSend) {
            oneSent();
            oneSend = true;
          }
          var sentQuery = `insert into sent (campaign_id, receiver) VALUES (?,?);`;
          var sentValues = [campaign_id, emailValue];
          await pool.promise().execute(sentQuery, sentValues);
        } else if (info.rejected && info.rejected.length > 0) {
          campaign_report.bounced.push(info);
          var bouncedQuery = `insert into bounced (campaign_id, receiver) VALUES (?,?);`;
          var bouncedValues = [campaign_id, emailValue];
          await pool.promise().execute(bouncedQuery, bouncedValues);
        } else {
          campaign_report.error.push({ info, receiver: emailValue });
          var bouncedQuery = `insert into bounced (campaign_id, receiver) VALUES (?,?);`;
          var bouncedValues = [campaign_id, emailValue];
          await pool.promise().execute(bouncedQuery, bouncedValues);
        }
      } catch (err) {
        console.log(err);
        if (err.responseCode === 535) {
          const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
          const updateValues = ["failed", campaign_id];
          await pool.promise().execute(updateQuery, updateValues);
          return res.status(535).json({
            error: "Bad Authentication",
          });
        } else {
          const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
          const updateValues = ["failed", campaign_id];
          await pool.promise().execute(updateQuery, updateValues);
          console.error(err);
          return res.status(403).json({
            error: "Something went wrong from Your Side",
          });
        }
      }
    }

    // Update campaign status in the database
    const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
    const updateValues = ["completed", campaign_id];
    await pool.promise().execute(updateQuery, updateValues);

    // Process sent and bounced recipients
    transporter.close();
  } catch (err) {
    res.status(500).json({ error: err });
  }
}

module.exports = {
  trackPOST,
  sendPOST,
};
