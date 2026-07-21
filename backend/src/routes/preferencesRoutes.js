const express = require("express");
const { supabaseAdmin } = require("../supabaseClient");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// GET /api/preferences
// Returns null if the user hasn't filled this out yet — the frontend uses
// that to decide whether to show the "first login" onboarding screen.
router.get("/", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("preferences")
    .select("*")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ preferences: data });
});

// PUT /api/preferences
// Body: { salaryMin, salaryMax, salaryUnit, mustHaves, niceToHaves, dealbreakers }
// Called once during onboarding, but safe to call again later if the user's
// targets change — it updates the existing row instead of creating a duplicate.
router.put("/", requireAuth, async (req, res) => {
  const { salaryMin, salaryMax, salaryUnit, mustHaves, niceToHaves, dealbreakers } = req.body;

  const payload = {
    user_id: req.user.id,
    salary_min: salaryMin ?? null,
    salary_max: salaryMax ?? null,
    salary_unit: salaryUnit || "yearly",
    must_haves: mustHaves || "",
    nice_to_haves: niceToHaves || "",
    dealbreakers: dealbreakers || "",
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabaseAdmin
    .from("preferences")
    .select("id")
    .eq("user_id", req.user.id)
    .maybeSingle();

  let result;
  if (existing) {
    result = await supabaseAdmin
      .from("preferences")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
  } else {
    result = await supabaseAdmin.from("preferences").insert(payload).select().single();
  }

  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ preferences: result.data });
});

module.exports = router;
