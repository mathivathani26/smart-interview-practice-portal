const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

function issueToken(user) {
  return jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
function publicUser(user) {
  return { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role };
}

router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ firstName, lastName, email, passwordHash });

    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Invalid email or password" });

    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during login" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { email, password, confirmPassword } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || typeof confirmPassword !== "string") {
    return res.status(400).json({ message: "Email, new password, and password confirmation are required" });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: "Enter a valid registered email address" });
  }
  if (!password || !confirmPassword) {
    return res.status(400).json({ message: "Email, new password, and password confirmation are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "The new password and confirmation do not match" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await User.updateOne({ email: normalizedEmail }, { $set: { passwordHash } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "No account was found with that email address" });
    }
    return res.json({ message: "Password reset successfully. Please log in with your new password." });
  } catch (err) {
    console.error("Password reset failed:", err.name || "unknown error");
    return res.status(500).json({ message: "Unable to update your password right now. Please try again." });
  }
});

module.exports = router;
