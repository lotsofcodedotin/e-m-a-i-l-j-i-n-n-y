const pool = require("../models/connection");
const { receipt } = require("../pixel");
const { instance } = require("./razorpay");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

async function checkout(req, res) {
  try {
    const options = {
      amount: req.body.amount * 100,
      currency: "INR",
      receipt: receipt(16),
      payment_capture: 1, // Auto-capture payment after successful payment
    };

    instance.orders.create(options, async (err, order) => {
      if (err) {
        console.error(err);
        return res.status(err.statusCode).json({ error: err.message });
        // Handle error
      } else {
        const [plans] = await pool.promise().execute("select * from plans");
        const user_plan = plans.filter(
          (plan) => plan.price == req.body.amount
        )[0];

        if (user_plan.length == 0) {
          return res.status(404).json({ error: "plan not found" });
        }

        //CHECK FOR EXISTING ENTRIES

        let [currentPack] = await pool
          .promise()
          .execute(
            "SELECT * FROM subscription WHERE user_email = ? AND subscription_end_date > CURRENT_TIMESTAMP ORDER BY `subscription`.`subscription_start_date` DESC;",
            [req.user.email]
          );

        if (currentPack.length == 0) {
          const query =
            "insert into subscription (razorpay_order_id,user_email,receipt,amount,status,currency,plan,subscription_start_date,pending_daily_withoutlogo_emails) values (?,?,?,?,?,?,?,current_timestamp,?)";
          const values = [
            order.id,
            req.user.email,
            order.receipt,
            Number(Number(order.amount) / 100),
            order.status,
            order.currency,
            user_plan.plan_name,
            user_plan.plan_name == "JINNY UNLIMITED" ? 9999999999 : 100,
          ];
          const [result] = await pool.promise().execute(query, values);
        } else {
          let datetime =
            new Date(currentPack[0]["subscription_end_date"])
              .toISOString()
              .split("T")[0] +
            " " +
            new Date(currentPack[0]["subscription_end_date"])
              .toISOString()
              .split("T")[1]
              .split(".")[0];

          console.log(datetime);
          const query =
            "insert into subscription (razorpay_order_id,user_email,receipt,amount,status,currency,plan,subscription_start_date, pending_daily_withoutlogo_emails) values (?,?,?,?,?,?,?,?,?)";
          const values = [
            order.id,
            req.user.email,
            order.receipt,
            Number(Number(order.amount) / 100),
            order.status,
            order.currency,
            user_plan.plan_name,
            datetime,
            user_plan.plan_name == "JINNY UNLIMITED" ? 9999999999 : 100,
          ];
          const [result] = await pool.promise().execute(query, values);
        }

        res.status(200).json({
          success: true,
          message: "order created successfully",
          order,
          user: req.user.email,
        });
      }
    });
  } catch (err) {
    res.status(500).json({
      error: "internal server error",
    });
  }
}

const paymentVerification = async function (req, res) {
  try {
    let generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(
        (
          req.body.razorpay_order_id +
          "|" +
          req.body.razorpay_payment_id
        ).toString()
      )
      .digest("hex");

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (generated_signature == req.body.razorpay_signature) {
      console.log("payment successful");
      const query =
        "update subscription SET razorpay_payment_id = ?, razorpay_signature = ?, status = ?, subscription_end_date = DATE_ADD(subscription_start_date, INTERVAL 27 DAY) where razorpay_order_id = ?";
      const values = [
        razorpay_payment_id.toString(),
        razorpay_signature.toString(),
        "completed",
        razorpay_order_id.toString(),
      ];
      const [result] = await pool.promise().execute(query, values);
      let [currentPack] = await pool
        .promise()
        .execute(
          "SELECT * FROM subscription WHERE user_email = ? AND subscription_end_date > CURRENT_TIMESTAMP ORDER BY `subscription`.`subscription_end_date` DESC;",
          [req.user.email]
        );

      if (currentPack.length != 0) {
        var {
          plan,
          subscription_start_date,
          subscription_end_date,
          pending_daily_withoutlogo_emails,
        } = currentPack[0];

        const emailSubject = `Subscription Alert - Thank you for your subscription`;
        const message = `Hey ${req.user.email},

Thanks a bunch for subscribing! We're thrilled to have you onboard.
If you ever need anything, just give us a shout. Let's make some magic happen together!
Plan Details -
Plan Name   - ${plan}
Starts From - ${subscription_start_date}
Starts End  - ${subscription_end_date}
        
Cheers,
Team EmailJinny`;

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
          html: `<pre style="font-family: "Impact", sans-serif;">${message}</pre>`,
        });
        transporter.close();
      }

      res.status(200).json({ message: "Plan Activated, Please Login Again" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Invalid Payment Signature" });
  }
};

module.exports = {
  checkout,
  paymentVerification,
};
