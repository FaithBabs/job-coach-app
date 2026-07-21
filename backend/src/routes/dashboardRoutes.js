const express = require("express");
const { supabaseAdmin } = require("../supabaseClient");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

const SPRINT_LENGTH = 30;
const DAILY_GOAL = 10;

// The sprint schedule is Mon-Fri + Sunday (Saturday is a rest day).
function isActiveDay(date) {
  return date.getDay() !== 6; // 0=Sun ... 6=Sat
}

// Counts how many "active" days (Mon-Fri + Sun) have occurred from
// sprint_start_date through today, inclusive. That count IS the sprint day
// number — e.g. if today is the 14th active day, the user is on Day 14.
function countActiveDaysInclusive(startDateStr, todayDateStr) {
  let count = 0;
  const d = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${todayDateStr}T00:00:00`);
  while (d <= end) {
    if (isActiveDay(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/dashboard
// Everything the main screen needs in one call: what sprint day it is,
// today's application count vs the 10/day goal, and the running total.
router.get("/", requireAuth, async (req, res) => {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", req.user.id)
    .single();

  if (profileError) return res.status(500).json({ error: profileError.message });

  const today = todayDateString();
  const sprintDay = countActiveDaysInclusive(profile.sprint_start_date, today);

  const { data: allJobs, error: jobsError } = await supabaseAdmin
    .from("job_applications")
    .select("id, date_applied, stage")
    .eq("user_id", req.user.id);

  if (jobsError) return res.status(500).json({ error: jobsError.message });

  const todayCount = allJobs.filter((j) => j.date_applied === today).length;
  const totalCount = allJobs.length;

  const stageBreakdown = allJobs.reduce((acc, j) => {
    acc[j.stage] = (acc[j.stage] || 0) + 1;
    return acc;
  }, {});

  res.json({
    sprintStartDate: profile.sprint_start_date,
    sprintDay,
    sprintLength: SPRINT_LENGTH,
    isActiveDayToday: isActiveDay(new Date(`${today}T00:00:00`)),
    dailyGoal: DAILY_GOAL,
    todayCount,
    totalCount,
    stageBreakdown,
  });
});

// PATCH /api/dashboard/sprint-start
// Body: { sprintStartDate: "YYYY-MM-DD" }
// Lets a user manually set/correct their Day 1 (e.g. if they signed up
// early but want the sprint to officially start the following Monday).
router.patch("/sprint-start", requireAuth, async (req, res) => {
  const { sprintStartDate } = req.body;
  if (!sprintStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(sprintStartDate)) {
    return res.status(400).json({ error: "sprintStartDate must be in YYYY-MM-DD format." });
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ sprint_start_date: sprintStartDate })
    .eq("id", req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data });
});

module.exports = router;
