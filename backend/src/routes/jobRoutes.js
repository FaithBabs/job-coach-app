const express = require("express");
const { supabaseAdmin } = require("../supabaseClient");
const { requireAuth } = require("../middleware/requireAuth");
const { runCoachingMode } = require("../coach");

const router = express.Router();

// Deterministic, no AI needed — compares the posted salary range to the
// user's saved target so they can see it before wasting an application.
function compareSalary({ postedMin, postedMax, preferences }) {
  if (postedMin == null && postedMax == null) return "not_listed";
  if (!preferences || (preferences.salary_min == null && preferences.salary_max == null)) return "not_listed";

  const targetMin = preferences.salary_min ?? -Infinity;
  const targetMax = preferences.salary_max ?? Infinity;
  const offeredMax = postedMax ?? postedMin;
  const offeredMin = postedMin ?? postedMax;

  if (offeredMax < targetMin) return "below";
  if (offeredMin > targetMax) return "above";
  return "within";
}

// POST /api/jobs
// Body: { companyName, roleTitle, jobPostingText, postedSalaryMin?, postedSalaryMax?, dateApplied? }
// This is what turns a pasted job posting into a tracker row.
router.post("/", requireAuth, async (req, res) => {
  const { companyName, roleTitle, jobPostingText, postedSalaryMin, postedSalaryMax, dateApplied } = req.body;

  if (!jobPostingText || !jobPostingText.trim()) {
    return res.status(400).json({ error: "Job posting text is required." });
  }

  const { data: preferences } = await supabaseAdmin
    .from("preferences")
    .select("*")
    .eq("user_id", req.user.id)
    .maybeSingle();

  const salary_comparison = compareSalary({
    postedMin: postedSalaryMin ?? null,
    postedMax: postedSalaryMax ?? null,
    preferences,
  });

  const posted_salary_text =
    postedSalaryMin || postedSalaryMax
      ? `${postedSalaryMin ?? "?"}–${postedSalaryMax ?? "?"}`
      : "Not listed";

  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .insert({
      user_id: req.user.id,
      company_name: companyName || "Unknown",
      role_title: roleTitle || "Unknown",
      job_posting_text: jobPostingText,
      posted_salary_text,
      salary_comparison,
      date_applied: dateApplied || new Date().toISOString().slice(0, 10),
      stage: "applied",
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ job: data });
});

// GET /api/jobs?stage=interview&sort=date_applied
// Lists every job for the logged-in user, newest first by default.
router.get("/", requireAuth, async (req, res) => {
  const { stage, sort } = req.query;

  let query = supabaseAdmin.from("job_applications").select("*").eq("user_id", req.user.id);
  if (stage) query = query.eq("stage", stage);
  query = query.order(sort || "date_applied", { ascending: false });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ jobs: data });
});

// GET /api/jobs/:id — one job plus everything ever generated for it
router.get("/:id", requireAuth, async (req, res) => {
  const { data: job, error } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .single();

  if (error) return res.status(404).json({ error: "Job not found." });

  const { data: outputs } = await supabaseAdmin
    .from("tailored_outputs")
    .select("*")
    .eq("job_application_id", req.params.id)
    .order("created_at", { ascending: false });

  res.json({ job, outputs: outputs || [] });
});

// PATCH /api/jobs/:id
// Body: any subset of { stage, notes, companyName, roleTitle }
// Used for moving a job through the pipeline and jotting notes.
router.patch("/:id", requireAuth, async (req, res) => {
  const { stage, notes, companyName, roleTitle } = req.body;
  const validStages = ["applied", "phone_screen", "interview", "final_round", "offer", "rejected", "withdrawn"];

  const updates = {};
  if (stage !== undefined) {
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: `Stage must be one of: ${validStages.join(", ")}` });
    }
    updates.stage = stage;
  }
  if (notes !== undefined) updates.notes = notes;
  if (companyName !== undefined) updates.company_name = companyName;
  if (roleTitle !== undefined) updates.role_title = roleTitle;

  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .update(updates)
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ job: data });
});

// ---- Generation endpoints, all tied to a specific job ----

async function generateAndSave({ req, res, mode, outputType, extraMessages }) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .single();
  if (jobError) return res.status(404).json({ error: "Job not found." });

  const { data: resume } = await supabaseAdmin
    .from("master_resumes")
    .select("resume_text")
    .eq("user_id", req.user.id)
    .maybeSingle();
  if (!resume) return res.status(400).json({ error: "Save your master resume before generating content." });

  const { data: preferences } = await supabaseAdmin
    .from("preferences")
    .select("*")
    .eq("user_id", req.user.id)
    .maybeSingle();

  try {
    const content = await runCoachingMode({
      mode,
      resumeText: resume.resume_text,
      jobPostingText: job.job_posting_text,
      preferences,
      companyName: job.company_name,
      roleTitle: job.role_title,
      extraMessages,
    });

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("tailored_outputs")
      .insert({
        job_application_id: job.id,
        user_id: req.user.id,
        output_type: outputType,
        content,
      })
      .select()
      .single();

    if (saveError) return res.status(500).json({ error: saveError.message });
    res.json({ output: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/jobs/:id/generate/resume — tailored resume + cover letter hook (/optimize)
router.post("/:id/generate/resume", requireAuth, (req, res) =>
  generateAndSave({ req, res, mode: "optimize", outputType: "resume" })
);

// POST /api/jobs/:id/generate/linkedin — LinkedIn profile suggestions (/linkedin)
router.post("/:id/generate/linkedin", requireAuth, (req, res) =>
  generateAndSave({ req, res, mode: "linkedin", outputType: "linkedin" })
);

// POST /api/jobs/:id/generate/qaprep — one-shot interview Q&A list (/qaprep)
router.post("/:id/generate/qaprep", requireAuth, (req, res) =>
  generateAndSave({ req, res, mode: "qaprep", outputType: "interview_prep" })
);

// POST /api/jobs/:id/generate/mock-interview — one turn of the live mock interview (/prep)
// Body: { conversationHistory: [{ role: "user"|"assistant", content: "..." }, ...] }
// The frontend keeps sending the growing conversation back each turn; the
// server has no memory of it between requests (kept stateless on purpose).
router.post("/:id/generate/mock-interview", requireAuth, (req, res) => {
  const { conversationHistory } = req.body;
  return generateAndSave({
    req,
    res,
    mode: "prep",
    outputType: "mock_interview_turn",
    extraMessages: Array.isArray(conversationHistory) ? conversationHistory : [],
  });
});

module.exports = router;
