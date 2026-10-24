const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token provided" });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    const user = await User.findById(payload.userId);
    if (!user || (payload.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    req.userId = user._id;
    req.userRole = user.role;
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unable to verify account authentication" });
  }
}

module.exports = requireAuth;
