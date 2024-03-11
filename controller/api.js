const pixel = require("../pixel");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const pool = require("../models/connection");
const { decryptUserData, replacePlaceholders } = require("./AES");
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
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function sendEmailWithoutBrand(req, res) {
  try {
    const { plan, subscription_end_date } = req.user.subscribed;

    if (new Date(subscription_end_date) < new Date(Date.now())) {
      res.clearCookie("subscribed");
      return res.status(403).json({ error: "Invalid subscription" });
    }

    let i = 0;
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
    const campign_id = pixel.generateUniquePixel();
    const campaign_report = {
      id: campign_id,
      total_sent: to.length,
      sent: [],
      bounced: [],
      error: [],
    };

    const secrets = req.user.secrets;
    if (!secrets) {
      return res.redirect("/config");
    }

    const { host, email, password, port, secure, max } = req.user.secrets;
    const decryptedHost = await decryptUserData(host);
    const decryptedPort = await decryptUserData(port);
    const decryptedSecure = await decryptUserData(secure);
    const decryptedPassword = await decryptUserData(password);
    const decryptedEmail = await decryptUserData(email);
    const maxRatePerMinute = await decryptUserData(max);

    let transporter = nodemailer.createTransport({
      pool: true,
      host: decryptedHost,
      port: decryptedPort,
      secure: decryptedSecure,
      maxConnections: 1,
      auth: {
        user: decryptedEmail,
        pass: decryptedPassword,
      },
      rateLimit: maxRatePerMinute || 5,
      rateDelta: 60 * 1000,
    });

    // Insert initial campaign details into the database
    const startQuery = `INSERT INTO campaign (campaign_id, sender, status, total_emails) VALUES (?, ?, ?, ?);`;
    const startValues = [campign_id, req.user.email, "started", "" + to.length];
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

        if (plan == "JINNY" && i > 100) {
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
          
                      <div><img width="1" height="1" src="https://app.emailjinny.com/public/assets/${campign_id}/${emailValue}/img.png" alt="pixel" /></div>
                      <div style="text-align: center; padding: 40px">
                      <a href="https://emailjinny.com/" style="text-decoration: none; color: #d90429;">
                        <h6 style="color: #d90429;font-size:10px; font-family:'Roboto', sans-sarif;">send unlimited free email with 💝</h6>
                        <img style="max-width: 250px" src="https://app.emailjinny.com/public/assets/img/logo.png"/>
                      </a>            
                      </div>
                    </div>
                    </body></html>`;
        } else {
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
          
                      <div><img width="1" height="1" src="https://app.emailjinny.com/public/assets/${campign_id}/${emailValue}/img.png" alt="pixel" /></div>
                    </div>
                    </body></html>`;
        }

        // send next message from the pending queue
        const info = await transporter.sendMail({
          from: decryptedEmail,
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
            i++;
          }
        } else if (info.rejected && info.rejected.length > 0) {
          campaign_report.bounced.push(info);
        } else {
          campaign_report.error.push({ info, receiver: emailValue });
        }
      } catch (err) {
        console.log(err);
        return res.status(500).json({
          error: "Credentials for Sending Email may be wrong. Please Check",
        });
      }
    }

    // Update campaign status in the database
    const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
    const updateValues = ["completed", campign_id];
    await pool.promise().execute(updateQuery, updateValues);

    // Process sent and bounced recipients

    if (campaign_report.sent.length > 0) {
      var sentQuery = `insert into sent (campaign_id, receiver) VALUES`;
      var sentValues = [];
      var receiverSentValues = [];
      for (let i = 0; i < campaign_report.sent.length; i++) {
        sentQuery += ` (?, ?),`;
        receiverSentValues[i] = campaign_report.sent[i].accepted[0];
      }
      sentQuery = sentQuery.substring(0, sentQuery.length - 1);
      sentQuery += ";";

      for (let i = 0; i < campaign_report.sent.length; i++) {
        sentValues.push(campign_id);
        sentValues.push(receiverSentValues[i]);
      }
      var [resultSent] = await pool.promise().execute(sentQuery, sentValues);
    }

    /** */
    // bounced
    if (campaign_report.bounced.length > 0) {
      console.log("bounced running");
      var rejectedQuery = `insert into bounced (campaign_id, receiver) VALUES`;
      var rejectedValues = [];
      var receiverRejectedValues = [];
      for (let i = 0; i < campaign_report.bounced.length; i++) {
        rejectedQuery += ` (?, ?),`;
        receiverRejectedValues[i] = campaign_report.bounced[i].accepted[0];
      }
      rejectedQuery = rejectedQuery.substring(0, rejectedQuery.length - 1);
      rejectedQuery += ";";

      for (let i = 0; i < campaign_report.bounced.length; i++) {
        rejectedValues.push(campign_id);
        rejectedValues.push(receiverRejectedValues[i]);
      }
      var [resultRejected] = await pool
        .promise()
        .execute(rejectedQuery, rejectedValues);
    }

    if (campaign_report.error.length > 0) {
      console.log("error running");
      var bouncedQuery = `insert into bounced (campaign_id, receiver) VALUES`;
      var bouncedValues = [];
      var receiverBouncedValues = [];
      for (let i = 0; i < campaign_report.error.length; i++) {
        bouncedQuery += ` (?, ?),`;
        receiverBouncedValues[i] = campaign_report.error[i]["receiver"];
      }
      bouncedQuery = bouncedQuery.substring(0, bouncedQuery.length - 1);
      bouncedQuery += ";";

      for (let i = 0; i < campaign_report.error.length; i++) {
        bouncedValues.push(campign_id);
        bouncedValues.push(receiverBouncedValues[i]);
      }
      console.log(campaign_report.error);
      var [resultBounced] = await pool
        .promise()
        .execute(bouncedQuery, bouncedValues);
    }
    transporter.close();
  } catch (err) {
    throw Error(err);
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
    const campign_id = pixel.generateUniquePixel();
    const campaign_report = {
      id: campign_id,
      total_sent: to.length,
      sent: [],
      bounced: [],
      error: [],
    };

    const secrets = req.user.secrets;
    if (!secrets) {
      return res.redirect("/config");
    }

    const { host, email, password, port, secure, max } = req.user.secrets;
    const decryptedHost = await decryptUserData(host);
    const decryptedPort = await decryptUserData(port);
    const decryptedSecure = await decryptUserData(secure);
    const decryptedPassword = await decryptUserData(password);
    const decryptedEmail = await decryptUserData(email);
    const maxRatePerMinute = await decryptUserData(max);

    let transporter = nodemailer.createTransport({
      pool: true,
      host: decryptedHost,
      port: decryptedPort,
      secure: decryptedSecure,
      maxConnections: 1,
      auth: {
        user: decryptedEmail,
        pass: decryptedPassword,
      },
      rateLimit: maxRatePerMinute || 5,
      rateDelta: 60 * 1000,
    });

    // Insert initial campaign details into the database
    const startQuery = `INSERT INTO campaign (campaign_id, sender, status, total_emails) VALUES (?, ?, ?, ?);`;
    const startValues = [campign_id, req.user.email, "started", "" + to.length];
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

            <div><img width="1" height="1" src="https://app.emailjinny.com/public/assets/${campign_id}/${emailValue}/img.png" alt="pixel" /></div>
            <div style="text-align: center; padding: 40px">
            <a href="https://emailjinny.com/" style="text-decoration: none; color: #d90429;">
              <h6 style="color: #d90429;font-size:10px; font-family:'Roboto', sans-sarif;">send unlimited free email with 💝</h6>
              <img style="max-width: 250px" src="https://app.emailjinny.com/public/assets/img/logo.png"/>
            </a>            
            </div>
          </div>
          </body></html>`;
        // send next message from the pending queue
        const info = await transporter.sendMail({
          from: decryptedEmail,
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
        } else if (info.rejected && info.rejected.length > 0) {
          campaign_report.bounced.push(info);
        } else {
          campaign_report.error.push({ info, receiver: emailValue });
        }
      } catch (err) {
        console.log(err);
        return res.status(500).json({
          error: "Credentials for Sending Email may be wrong. Please Check",
        });
      }
    }

    // Update campaign status in the database
    const updateQuery = `UPDATE campaign SET status = ? WHERE campaign_id = ?;`;
    const updateValues = ["completed", campign_id];
    await pool.promise().execute(updateQuery, updateValues);

    // Process sent and bounced recipients

    if (campaign_report.sent.length > 0) {
      var sentQuery = `insert into sent (campaign_id, receiver) VALUES`;
      var sentValues = [];
      var receiverSentValues = [];
      for (let i = 0; i < campaign_report.sent.length; i++) {
        sentQuery += ` (?, ?),`;
        receiverSentValues[i] = campaign_report.sent[i].accepted[0];
      }
      sentQuery = sentQuery.substring(0, sentQuery.length - 1);
      sentQuery += ";";

      for (let i = 0; i < campaign_report.sent.length; i++) {
        sentValues.push(campign_id);
        sentValues.push(receiverSentValues[i]);
      }
      var [resultSent] = await pool.promise().execute(sentQuery, sentValues);
    }

    /** */
    // bounced
    if (campaign_report.bounced.length > 0) {
      console.log("bounced running");
      var rejectedQuery = `insert into bounced (campaign_id, receiver) VALUES`;
      var rejectedValues = [];
      var receiverRejectedValues = [];
      for (let i = 0; i < campaign_report.bounced.length; i++) {
        rejectedQuery += ` (?, ?),`;
        receiverRejectedValues[i] = campaign_report.bounced[i].accepted[0];
      }
      rejectedQuery = rejectedQuery.substring(0, rejectedQuery.length - 1);
      rejectedQuery += ";";

      for (let i = 0; i < campaign_report.bounced.length; i++) {
        rejectedValues.push(campign_id);
        rejectedValues.push(receiverRejectedValues[i]);
      }
      var [resultRejected] = await pool
        .promise()
        .execute(rejectedQuery, rejectedValues);
    }

    if (campaign_report.error.length > 0) {
      console.log("error running");
      var bouncedQuery = `insert into bounced (campaign_id, receiver) VALUES`;
      var bouncedValues = [];
      var receiverBouncedValues = [];
      for (let i = 0; i < campaign_report.error.length; i++) {
        bouncedQuery += ` (?, ?),`;
        receiverBouncedValues[i] = campaign_report.error[i]["receiver"];
      }
      bouncedQuery = bouncedQuery.substring(0, bouncedQuery.length - 1);
      bouncedQuery += ";";

      for (let i = 0; i < campaign_report.error.length; i++) {
        bouncedValues.push(campign_id);
        bouncedValues.push(receiverBouncedValues[i]);
      }
      var [resultBounced] = await pool
        .promise()
        .execute(bouncedQuery, bouncedValues);
    }
    transporter.close();
  } catch (err) {
    throw Error(err);
  }
}

module.exports = {
  trackPOST,
  sendPOST,
};
