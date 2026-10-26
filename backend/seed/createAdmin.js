
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("../config/db");
const User = require("../models/User");

async function createAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password || password.length < 12) {
      throw new Error(
        "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters)."
      );
    }

    await connectDB();

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("Account already exists. No changes made.");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await User.create({
      firstName: "Portal",
      lastName: "Admin",
      email,
      passwordHash,
      role: "admin"
    });

    console.log("Admin account created successfully!");
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

createAdmin();
