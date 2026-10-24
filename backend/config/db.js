const mongoose = require("mongoose");

async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not configured.");
    await mongoose.connect(uri);
    console.log(`MongoDB connected to database "${mongoose.connection.db.databaseName}".`);
  } catch (err) {
    const safeMessage = String(err.message || "Unknown connection error")
      .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted MongoDB URI]");
    console.error("MongoDB connection failed:", err.name, err.code || "", safeMessage);
    process.exit(1);
  }
}

module.exports = connectDB;
