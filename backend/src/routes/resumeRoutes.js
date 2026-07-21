const express = require("express");
const { supabaseAdmin } = require("../supabaseClient");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// GET /api/resume — returns the saved master resume, or null if none saved yet.
router.get("/", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("master_resumes")
    .select("*")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ resume: data });
});

// PUT /api/resume
// Body: { resumeText }
// Saves/overwrites the ONE master resume for this user. This is what makes
// "paste your resume once on Day 1, reuse it every day after" work — every
// tailoring request pulls from this saved copy instead of asking again.
router.put("/", requireAuth, async (req, res) => {
  const { resumeText } = req.body;

  if (!resumeText || !resumeText.trim()) {
    return res.status(400).json({ error: "Resume text is required." });
  }

  const { data: existing } = await supabaseAdmin
    .from("master_resumes")
    .select("id")
    .eq("user_id", req.user.id)
    .maybeSingle();

  const payload = {
    user_id: req.user.id,
    resume_text: resumeText,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing) {
    result = await supabaseAdmin
      .from("master_resumes")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
  } else {
    result = await supabaseAdmin.from("master_resumes").insert(payload).select().single();
  }

  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ resume: result.data });
});

module.exports = router;
