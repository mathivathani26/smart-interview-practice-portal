require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const companyRoutes = require("./routes/companies");
const sessionRoutes = require("./routes/sessions");
const codeRoutes = require("./routes/code");
const leaderboardRoutes = require("./routes/leaderboard");
const adminRoutes = require("./routes/admin");

const app = express();
app.use(cors());
app.use(express.json());

connectDB();

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/code", codeRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/admin", adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
