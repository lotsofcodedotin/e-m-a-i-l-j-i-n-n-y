const jwt = require("jsonwebtoken");

function secrets(req, res, next) {
  const secrets = req.cookies.secrets;
  if (!secrets) {
    return res.redirect("/config");
  }
  try {
    // Verify the token using the secret key
    const decoded = jwt.verify(secrets, process.env.JWT_SECRET);
    // Save the decoded user to the request object
    req.user.secrets = decoded;
    // Call the next middleware
    next();
  } catch (err) {
    return res.redirect("/config");
  }
}

module.exports = secrets;
