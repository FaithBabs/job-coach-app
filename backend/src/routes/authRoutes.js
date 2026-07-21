const express = require("express");
const { supabasePublic } = require("../supabasePublicClient");
const { supabaseAdmin } = require("../supabaseClient");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// POST /api/auth/signup
// Body: { email, password, sprintStartDate? } (sprintStartDate is optional, "YYYY-MM-DD")
// Creates the login AND the user's profile row (Day 1 tracking) in one step.
router.post("/signup", async (req, res) => {
  const { email, password, sprintStartDate } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const { data, error } = await supabasePublic.auth.signUp({ email, password });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const newUser = data.user;

  // If email confirmation is turned on in Supabase, newUser exists but there's
  // no session yet — they'll need to confirm via email before logging in.
  if (newUser) {
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUser.id,
      sprint_start_date: sprintStartDate || new Date().toISOString().slice(0, 10),
    });

    // Don't fail the whole signup if this errors (e.g. row already exists) — log it.
    if (profileError) {
      console.error("Failed to create profile row:", profileError.message);
    }
  }

  res.json({
    user: newUser,
    session: data.session, // null if email confirmation is required
    needsEmailConfirmation: !data.session,
  });
});

// POST /api/auth/login
// Body: { email, password }
// Returns an access_token the frontend must send as "Authorization: Bearer <token>"
// on every future request to a protected route.
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user,
  });
});

// GET /api/auth/me
// Protected route — proves the token system works end to end.
// Returns the logged-in user's info plus their profile row.
router.get("/me", requireAuth, async (req, res) => {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", req.user.id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ user: { id: req.user.id, email: req.user.email }, profile });
});

module.exports = router;
