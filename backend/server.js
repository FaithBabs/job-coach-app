require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" })); // resumes/job postings are text, 2mb is plenty of headroom

// Serve the frontend (plain HTML/JS) once it exists in ../frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Simple route so we can confirm the server is alive and env vars loaded
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    supabaseConfigured: Boolean(process.env.SUPABASE_URL),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

const authRoutes = require("./src/routes/authRoutes");
const preferencesRoutes = require("./src/routes/preferencesRoutes");
const resumeRoutes = require("./src/routes/resumeRoutes");
const jobRoutes = require("./src/routes/jobRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
