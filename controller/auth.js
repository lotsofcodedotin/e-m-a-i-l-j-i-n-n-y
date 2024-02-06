const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  // Get the token from the cookie
  const token = req.cookies.jwtToken;
  if (!token) {
    return res.redirect("/login");
  }
  try {
    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Save the decoded user to the request object
    req.user = decoded;
    // Call the next middleware
    next();
  } catch (err) {
    return res.redirect("/login");
  }
}

function verified(req, res, next) {
  const verified = req.cookies.verified;
  if (!verified) {
    return res.redirect("/verification");
  }
  try {
    // Verify the token using the secret key
    const decoded = jwt.verify(verified, process.env.JWT_SECRET);
    // Save the decoded user to the request object
    req.user.verification = decoded;
    // Call the next middleware
    next();
  } catch (err) {
    return res.redirect("/verification");
  }
}

function subscribed(req, res, next) {
  const subscribed = req.cookies.subscribed;
  if (!subscribed) {
    req.user.subscribed = false;
    req.subscribed = false;
    return next();
  }

  try {
    const decoded = jwt.verify(subscribed, process.env.JWT_SECRET);
    req.user.subscribed = decoded;
    req.subscribed = true;
    return next();
  } catch (err) {
    req.user.subscribed = false;
    req.subscribed = false;
    return next();
  }
}

module.exports = { authenticate, verified, subscribed };
