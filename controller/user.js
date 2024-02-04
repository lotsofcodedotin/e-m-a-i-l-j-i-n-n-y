const pool = require("../models/connection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { encryptUserData } = require("./AES");
const nodemailer = require("nodemailer");
const { generateUniquePixel, generateToken } = require("../pixel");

// Function to encrypt user data

// Function to decrypt user data (backend)

const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for existing user
    const [users, fields] = await pool
      .promise()
      .execute("SELECT * FROM users WHERE email = ?", [email]);

    if (users.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into the database
    const [result, insertFields] = await pool
      .promise()
      .execute("INSERT INTO users (email, password) VALUES (?, ?)", [
        email,
        hashedPassword,
      ]);

    if (result && result.affectedRows === 1) {
      // Redirect after successful registration
      return res.status(201).json({ message: "registration successful" });
    } else {
      console.log("Something went wrong during user registration");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Fetch user from database
    const [users, fields] = await pool
      .promise()
      .execute("SELECT * FROM users WHERE email = ?", [email]);

    if (users.length === 0) {
      console.log("Email not found");
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET);

      if (user.verified == true) {
        const verifiedJWT = jwt.sign(
          { verified: true },
          process.env.JWT_SECRET
        );
        // Return the token and user data
        res.cookie("verified", verifiedJWT, {
          httpOnly: true,
          secure: true,
        });
      }

      // Return the token and user data
      const expiryDate = new Date(Date.now() + 86400000);

      res.cookie("jwtToken", token, {
        httpOnly: true,
        secure: true,
      });

      if (user.licenses > 0) {
        const subscribeToken = jwt.sign(
          { email: user.email },
          process.env.JWT_SECRET
        );

        res.cookie("subscribed", subscribeToken, {
          httpOnly: true,
          secure: true,
        });
      }

      const checkQuery = "SELECT * FROM secrets WHERE user_id = ?";
      const checkValues = [user.email];

      const [result] = await pool.promise().execute(checkQuery, checkValues);

      if (result.length > 0) {
        const {
          host,
          port,
          from_email: email,
          password,
          secure,
          max,
        } = result[0];
        var expiresIn = "1d";
        const secret = jwt.sign(
          { host, port, email, password, secure, max },
          process.env.JWT_SECRET
        );

        // Return the token and user data
        const exdate = new Date(Date.now() + 86400000);

        res.cookie("secrets", secret, {
          httpOnly: true,
          secure: true,
        });

        return res.redirect("/");
      } else {
        return res.redirect("/config");
      }
    } else {
      console.log("Invalid password");
      return res.status(401).json({ error: "Invalid email or password" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error logging in" });
  }
};

const config = async (req, res) => {
  // const token = req.cookies?.jwtToken;
  // const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user_email = req.user.email;

  try {
    var { host, port, secure, email, password, max } = req.body;

    // Encrypt data
    host = await encryptUserData(host);
    port = await encryptUserData(port);
    secure = await encryptUserData(secure);
    password = await encryptUserData(password);
    email = await encryptUserData(email);
    maxPerMinute = await encryptUserData(max || 5);

    // Check for existing entry
    const checkQuery = "SELECT * FROM secrets WHERE user_id = ?";
    const checkValues = [user_email];

    await pool.execute(checkQuery, checkValues, (err, result) => {
      if (err) {
        console.log(err);
        return res
          .status(500)
          .json({ error: "Error checking for existing data" });
      }

      if (result.length > 0) {
        // Entry exists, update it
        const updateQuery =
          "UPDATE secrets SET host = ?, port = ?, secure = ?, from_email = ?, password = ?, max = ? WHERE user_id = ?";
        const updateValues = [
          host,
          port,
          secure,
          email,
          password,
          maxPerMinute || 5,
          user_email,
        ];
        pool.execute(updateQuery, updateValues, (err, result) => {
          if (err) {
            console.log(err);
            return res.status(500).json({ error: "Error updating data" });
          }
          console.log("Data updated successfully");
          var expiresIn = "1d";
          const tokenNew = jwt.sign(
            { host, port, email, password, secure, max: maxPerMinute },
            process.env.JWT_SECRET
          );

          // Return the token and user data
          const expiryDate = new Date(Date.now() + 86400000);

          res.cookie("secrets", tokenNew, {
            httpOnly: true,
            secure: true,
          });
          return res.redirect("/");
        });
      } else {
        // Entry doesn't exist, insert it
        const insertQuery =
          "INSERT INTO secrets (user_id, host, port, secure, from_email, password, max) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const insertValues = [
          user_email,
          host,
          port,
          secure,
          email,
          password,
          maxPerMinute || 5,
        ];
        pool.execute(insertQuery, insertValues, (err, result) => {
          if (err) {
            console.log(err);
            return res.status(500).json({ error: "Error inserting data" });
          }
          console.log("Data inserted successfully");

          const expiresIn = "1d";
          const tokenNew = jwt.sign(
            { host, port, email, password, secure, max: maxPerMinute },
            process.env.JWT_SECRET
          );

          // Return the token and user data
          const expiryDate = new Date(Date.now() + 86400000);
          res.cookie("secrets", tokenNew, {
            httpOnly: true,
            secure: true,
          });
          res.redirect("/");
        });
      }
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

async function resell(req, res) {
  try {
    const { recEmail, license, password } = req.body;

    if (recEmail == req.user.email) {
      return res
        .status(401)
        .json({ error: "you cannot send licenses to yourself" });
    }

    if (isNaN(license)) {
      return res.status(401).json({ error: "license must be number" });
    }

    if (license <= 0) {
      return res.status(401).json({ error: "license must be more than 0." });
    }

    const [recipient] = await pool
      .promise()
      .execute("select * from users where email = ?", [recEmail]);

    if (!recipient.length > 0) {
      return res.status(400).json({ error: "recipient not found" });
    }

    pool.getConnection((err, connection) => {
      if (err) throw err;

      connection.beginTransaction((beginTransactionErr) => {
        if (beginTransactionErr) {
          connection.release();
          throw beginTransactionErr;
        }

        const getUserQuery = `SELECT * FROM users WHERE email = ?`;
        connection.query(getUserQuery, [req.user.email], (err, results) => {
          if (err) {
            connection.rollback();
            connection.release();
            console.error(err);
          }

          const user = results[0];

          // Compare hashed password
          bcrypt.compare(
            password,
            user.password,
            (bcryptErr, passwordMatch) => {
              if (bcryptErr) {
                connection.rollback();
                connection.release();
                throw bcryptErr;
              }

              if (!passwordMatch) {
                connection.rollback();
                connection.release();
                return res.status(401).json({ error: "Invalid credentials" });
              }

              if (user.licenses < license) {
                connection.rollback();
                connection.release();
                return res
                  .status(400)
                  .json({ error: "Not enough licenses available" });
              }

              const updateLicensesQuery = `UPDATE users SET licenses = licenses - ? WHERE email = ?`;
              connection.query(
                updateLicensesQuery,
                [license, user.email],
                (err) => {
                  if (err) {
                    connection.rollback();
                    connection.release();
                    throw err;
                  }

                  const transferLicensesQuery = `UPDATE users SET licenses = licenses + ? WHERE email = ?`;
                  connection.query(
                    transferLicensesQuery,
                    [license, recEmail],
                    (err) => {
                      if (err) {
                        connection.rollback();
                        connection.release();
                        throw err;
                      }

                      const addTransactionQuery = `
                  INSERT INTO reselling (from_user, to_user, licenses)
                  VALUES (?, ?, ?)
                `;
                      connection.query(
                        addTransactionQuery,
                        [req.user.email, recEmail, license],
                        (err) => {
                          if (err) {
                            connection.rollback();
                            connection.release();
                            throw err;
                          }
                        }
                      );

                      connection.commit((commitErr) => {
                        if (commitErr) {
                          connection.rollback();
                          connection.release();
                          throw commitErr;
                        }

                        connection.release();

                        ///

                        const emailSubject = `Received  ${license} licenses - Welcome to EmailJinny!`;
                        const message = `Hey ${recEmail},

Welcome to EmailJinny! 🎉

Good news – you just got ${license} licenses from ${req.user.email}. Enjoy!

Cheers,
The EmailJinny Team`;

                        let transporter = nodemailer.createTransport({
                          host: process.env.TRANSPORTER_HOST,
                          port: process.env.TRANSPORTER_PORT,
                          secure: true,
                          auth: {
                            user: process.env.FROM,
                            pass: process.env.PASS,
                          },
                        });
                        const info = transporter.sendMail({
                          from: process.env.FROM,
                          to: recEmail,
                          subject: emailSubject,
                          html: `<pre>${message}</pre>`,
                        });

                        ///
                        res.json({
                          message: "Licenses transferred successfully",
                        });

                        transporter.close();
                      });
                    }
                  );
                }
              );
            }
          );
        });
      });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
}

async function resells(req, res) {
  try {
    const query = `
    SELECT reselling.to_user, reselling.licenses, reselling.time_stamp, users.licenses as available FROM users LEFT JOIN reselling ON reselling.from_user = users.email WHERE users.email = ? ORDER by time_stamp DESC;
  `;

    const [results] = await pool.promise().execute(query, [req.user.email]);

    res.status(200).json({ results: results });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  // Check if the current password is correct
  const checkPasswordQuery = "SELECT * FROM users WHERE email = ?";

  pool.query(checkPasswordQuery, [req.user.email], (error, results) => {
    if (error) {
      console.error("Error checking current password:", error);
      return res.status(500).json({ error: "Internal Server Error" });
      // Handle the error
    } else {
      if (results.length === 1) {
        const user = results[0];

        // Compare the current password with the hashed password in the database
        bcrypt.compare(
          currentPassword,
          user.password,
          (compareError, isMatch) => {
            if (compareError) {
              console.error("Error comparing passwords:", compareError);
              return res.status(500).json({ error: "Internal Server Error" });
              // Handle the error
            } else if (isMatch) {
              if (currentPassword === newPassword) {
                return res.status(403).json({
                  error: "Old Password and New Password can not be the same.",
                });
              }
              // Current password is correct, hash the new password and update
              bcrypt.hash(
                newPassword,
                10,
                async (hashError, hashedPassword) => {
                  if (hashError) {
                    console.error("Error hashing new password:", hashError);
                    return res
                      .status(500)
                      .json({ error: "Internal Server Error" });
                    // Handle the error
                  } else {
                    const updatePasswordQuery =
                      "UPDATE users SET password = ? WHERE email = ?";

                    pool.query(
                      updatePasswordQuery,
                      [hashedPassword, req.user.email],
                      async (updateError) => {
                        if (updateError) {
                          console.error(
                            "Error updating password:",
                            updateError
                          );
                          return res
                            .status(500)
                            .json({ error: "Internal Server Error" });
                          // Handle the error
                        } else {
                          console.log("Password updated successfully");
                          const emailSubject = `Password Changed on EmailJinny!`;
                          const message = `Hey ${req.user.email},
            
Your Password was changed Successfully! 🥂
            
Your new Password is ${newPassword}. Enjoy!
            
if it was not you? <a href="https://lotsofwms.in/change-password/">change password using above password.</a>
            
Cheers,
The EmailJinny Team`;

                          let transporter = nodemailer.createTransport({
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
                            html: `<pre>${message}</pre>`,
                          });
                          return res
                            .status(200)
                            .json({ message: "password updated successfully" });
                        }
                      }
                    );
                  }
                }
              );
            } else {
              console.log("Current password is incorrect");
              return res
                .status(403)
                .json({ error: "current password is incorrect" });
            }
          }
        );
      } else {
        console.log("User not found");
        // Handle user not found
      }
    }
  });
}

async function forgetPassword(req, res) {
  try {
    const { email } = req.body;

    const [users] = await pool
      .promise()
      .execute("select * from users where email = ?", [email]);

    if (users.length == 0) {
      console.log("User not found");
      return res.status(404).json({
        error: "User not exist or don't allow you to change password",
      });
    }

    const token = await generateToken();
    const query =
      "UPDATE users SET resetToken = CAST(? AS CHAR), resetTokenExpire = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email = ?";
    const result = await pool.promise().execute(query, [token, email]);

    const emailSubject = `Password Reset Request for EmailJinny!`;
    const message = `Hey ${email},
Your EmailJInny password can be reset by clicking the button below. If you did not request a new password, please ignore this email.
<br/>
<a width: 200px; height: 50px; style="padding: 5px 10px; border-radius: 2px; background:color: rgb(88, 101, 242); color: #fff" href="https://lotsofwms.in/reset-password/${token}">RESET PASSWORD</a>

Cheers,
The EmailJinny Team`;

    let transporter = nodemailer.createTransport({
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
      to: email,
      subject: emailSubject,
      html: `<pre>${message}</pre>`,
    });
    return res
      .status(200)
      .json({ message: "password reset link sent successfully" });
  } catch (err) {
    return res.status(500).json({ err });
  }
}

async function resetPassword(req, res) {
  try {
    const newPassword = req.body.newPassword;

    const token = req.params.token;

    const [users] = await pool
      .promise()
      .execute(
        "select * from users where resetToken = ? and resetTokenExpire > NOW()",
        [token]
      );

    if (users.length < 0) {
      return res.status(401).json({ error: "Reset Link Has been Expired" });
    }

    let newPasswordHash = await bcrypt.hashSync(newPassword, 10);

    const [result] = await pool
      .promise()
      .execute("update users SET password = ? where email = ?", [
        newPasswordHash,
        users[0].email,
      ]);

    const emailSubject = `Password Successfully Changed on EmailJinny!`;
    const message = `Hey ${users[0].email},

This email confirms that you recently changed the password for user account ${users[0].email}.
Your new password is ${newPassword}.
No further action is required.
  
Thanks,
The EmailJinny Team`;

    let transporter = nodemailer.createTransport({
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
      to: users[0].email,
      subject: emailSubject,
      html: `<pre>${message}</pre>`,
    });

    return res.status(200).json({ message: "Password Successfully Changed" });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}

module.exports = {
  register,
  login,
  config,
  resell,
  resells,
  changePassword,
  forgetPassword,
  resetPassword,
};
