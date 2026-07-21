// Plain JS, no framework. State lives in memory + localStorage (just the
// login token, so a page refresh doesn't force a re-login).

const STAGE_LABELS = {
  applied: "Applied",
  phone_screen: "Phone Screen",
  interview: "Interview",
  final_round: "Final Round",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const state = {
  token: localStorage.getItem("authToken") || null,
  currentJobId: null,
  jobs: [],
};

// ---------- API helper ----------
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- View switching ----------
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function setLoggedInChrome(loggedIn) {
  document.getElementById("topbar").classList.toggle("hidden", !loggedIn);
}

// ---------- Boot ----------
async function boot() {
  if (!state.token) {
    setLoggedInChrome(false);
    showView("view-auth");
    return;
  }
  try {
    await api("/auth/me"); // confirms token still valid
    setLoggedInChrome(true);
    await routeAfterLogin();
  } catch (e) {
    logout();
  }
}

async function routeAfterLogin() {
  const [{ resume }, { preferences }] = await Promise.all([api("/resume"), api("/preferences")]);
  if (!resume || !preferences) {
    showView("view-onboarding");
    if (resume) {
      document.getElementById("onboardResumeStep").classList.add("hidden");
      document.getElementById("onboardPrefsStep").classList.remove("hidden");
    }
    return;
  }
  await loadDashboard();
  showView("view-dashboard");
}

function logout() {
  localStorage.removeItem("authToken");
  state.token = null;
  setLoggedInChrome(false);
  showView("view-auth");
}

// ---------- Auth ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}Form`).classList.add("active");
  });
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  try {
    const data = await api("/auth/login", { method: "POST", body: { email, password } });
    state.token = data.access_token;
    localStorage.setItem("authToken", state.token);
    setLoggedInChrome(true);
    await routeAfterLogin();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const errEl = document.getElementById("signupError");
  errEl.textContent = "";
  try {
    const data = await api("/auth/signup", { method: "POST", body: { email, password } });
    if (data.needsEmailConfirmation) {
      errEl.style.color = "var(--good)";
      errEl.textContent = "Account created! Check your email to confirm, then log in.";
      return;
    }
    state.token = data.session.access_token;
    localStorage.setItem("authToken", state.token);
    setLoggedInChrome(true);
    await routeAfterLogin();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", logout);

// ---------- Onboarding ----------
document.getElementById("saveResumeBtn").addEventListener("click", async () => {
  const resumeText = document.getElementById("masterResumeInput").value.trim();
  const errEl = document.getElementById("resumeError");
  errEl.textContent = "";
  if (!resumeText) { errEl.textContent = "Paste your resume first."; return; }
  try {
    await api("/resume", { method: "PUT", body: { resumeText } });
    document.getElementById("onboardResumeStep").classList.add("hidden");
    document.getElementById("onboardPrefsStep").classList.remove("hidden");
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById("savePrefsBtn").addEventListener("click", async () => {
  const errEl = document.getElementById("prefsError");
  errEl.textContent = "";
  const body = {
    salaryUnit: document.getElementById("prefSalaryUnit").value,
    salaryMin: numOrNull(document.getElementById("prefSalaryMin").value),
    salaryMax: numOrNull(document.getElementById("prefSalaryMax").value),
    mustHaves: document.getElementById("prefMustHaves").value,
    niceToHaves: document.getElementById("prefNiceToHaves").value,
    dealbreakers: document.getElementById("prefDealbreakers").value,
  };
  try {
    await api("/preferences", { method: "PUT", body });
    await loadDashboard();
    showView("view-dashboard");
  } catch (err) {
    errEl.textContent = err.message;
  }
});

function numOrNull(v) { return v === "" || v === null || v === undefined ? null : Number(v); }

// ---------- Dashboard ----------
async function loadDashboard() {
  const dash = await api("/dashboard");
  document.getElementById("sprintBadge").textContent = `Day ${dash.sprintDay} of ${dash.sprintLength}`;
  document.getElementById("statSprintDay").textContent = dash.sprintDay;
  document.getElementById("statToday").textContent = `${dash.todayCount} / ${dash.dailyGoal}`;
  document.getElementById("statTotal").textContent = dash.totalCount;

  await loadJobs();
}

async function loadJobs() {
  const stage = document.getElementById("stageFilter").value;
  const { jobs } = await api(`/jobs${stage ? `?stage=${stage}` : ""}`);
  state.jobs = jobs;
  renderJobsTable(jobs);
}

function renderJobsTable(jobs) {
  const tbody = document.getElementById("jobsTableBody");
  const empty = document.getElementById("jobsEmpty");
  tbody.innerHTML = "";
  empty.classList.toggle("hidden", jobs.length > 0);

  jobs.forEach((job) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(job.company_name)}</td>
      <td>${escapeHtml(job.role_title)}</td>
      <td>${job.date_applied}</td>
      <td><span class="badge ${job.salary_comparison}">${salaryLabel(job.salary_comparison)}</span></td>
      <td>${STAGE_LABELS[job.stage] || job.stage}</td>
    `;
    tr.addEventListener("click", () => openJobDetail(job.id));
    tbody.appendChild(tr);
  });
}

function salaryLabel(comp) {
  return { above: "Above target", within: "Within target", below: "Below target", not_listed: "Not listed" }[comp] || comp;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.getElementById("stageFilter").addEventListener("change", loadJobs);

// ---------- New job modal ----------
const newJobModal = document.getElementById("newJobModal");
document.getElementById("newJobBtn").addEventListener("click", () => newJobModal.classList.remove("hidden"));
document.getElementById("cancelJobBtn").addEventListener("click", () => newJobModal.classList.add("hidden"));

document.getElementById("submitJobBtn").addEventListener("click", async () => {
  const errEl = document.getElementById("jobError");
  errEl.textContent = "";
  const body = {
    companyName: document.getElementById("jobCompany").value,
    roleTitle: document.getElementById("jobRole").value,
    jobPostingText: document.getElementById("jobPostingText").value.trim(),
    postedSalaryMin: numOrNull(document.getElementById("jobSalaryMin").value),
    postedSalaryMax: numOrNull(document.getElementById("jobSalaryMax").value),
  };
  if (!body.jobPostingText) { errEl.textContent = "Paste the job posting text."; return; }
  try {
    await api("/jobs", { method: "POST", body });
    newJobModal.classList.add("hidden");
    ["jobCompany", "jobRole", "jobPostingText", "jobSalaryMin", "jobSalaryMax"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    await loadDashboard();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// ---------- Job detail ----------
async function openJobDetail(jobId) {
  state.currentJobId = jobId;
  const { job, outputs } = await api(`/jobs/${jobId}`);

  document.getElementById("jobDetailTitle").textContent = `${job.role_title} at ${job.company_name}`;
  const badge = document.getElementById("jobDetailSalaryBadge");
  badge.textContent = salaryLabel(job.salary_comparison);
  badge.className = `badge ${job.salary_comparison}`;
  document.getElementById("jobDetailStage").value = job.stage;
  document.getElementById("jobDetailNotes").value = job.notes || "";
  document.getElementById("generateOutput").classList.add("hidden");

  const pastOutputsEl = document.getElementById("pastOutputs");
  pastOutputsEl.innerHTML = outputs.length
    ? ""
    : '<p class="hint">Nothing generated for this job yet.</p>';
  outputs.forEach((o) => {
    const div = document.createElement("div");
    div.className = "past-output";
    div.innerHTML = `<div class="meta">${o.output_type.replace("_", " ")} — ${new Date(o.created_at).toLocaleString()}</div>${escapeHtml(o.content)}`;
    pastOutputsEl.appendChild(div);
  });

  showView("view-job");
}

document.getElementById("backToDashboardBtn").addEventListener("click", async () => {
  await loadDashboard();
  showView("view-dashboard");
});

document.getElementById("jobDetailStage").addEventListener("change", async (e) => {
  await api(`/jobs/${state.currentJobId}`, { method: "PATCH", body: { stage: e.target.value } });
});

document.getElementById("saveNotesBtn").addEventListener("click", async () => {
  const notes = document.getElementById("jobDetailNotes").value;
  await api(`/jobs/${state.currentJobId}`, { method: "PATCH", body: { notes } });
});

document.querySelectorAll("[data-generate]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const type = btn.dataset.generate;
    const outputEl = document.getElementById("generateOutput");
    outputEl.classList.remove("hidden");
    outputEl.textContent = "Generating... this can take up to 30 seconds.";
    try {
      const { output } = await api(`/jobs/${state.currentJobId}/generate/${type}`, { method: "POST" });
      outputEl.textContent = output.content;
      await openJobDetail(state.currentJobId); // refresh saved-outputs list
    } catch (err) {
      outputEl.textContent = `Error: ${err.message}`;
    }
  });
});

// ---------- Mock interview ----------
let mockHistory = [];

document.getElementById("startMockInterviewBtn").addEventListener("click", async () => {
  mockHistory = [];
  document.getElementById("mockChat").innerHTML = "";
  showView("view-mock");
  await sendMockTurn();
});

document.getElementById("backFromMockBtn").addEventListener("click", () => showView("view-job"));

document.getElementById("sendMockAnswerBtn").addEventListener("click", async () => {
  const input = document.getElementById("mockAnswerInput");
  const answer = input.value.trim();
  if (!answer) return;
  appendMockMessage("candidate", answer);
  mockHistory.push({ role: "user", content: answer });
  input.value = "";
  await sendMockTurn();
});

async function sendMockTurn() {
  const chat = document.getElementById("mockChat");
  const thinking = document.createElement("div");
  thinking.className = "mock-msg interviewer";
  thinking.textContent = "...";
  chat.appendChild(thinking);
  chat.scrollTop = chat.scrollHeight;

  try {
    const { output } = await api(`/jobs/${state.currentJobId}/generate/mock-interview`, {
      method: "POST",
      body: { conversationHistory: mockHistory },
    });
    thinking.remove();
    appendMockMessage("interviewer", output.content);
    mockHistory.push({ role: "assistant", content: output.content });
  } catch (err) {
    thinking.textContent = `Error: ${err.message}`;
  }
}

function appendMockMessage(who, text) {
  const chat = document.getElementById("mockChat");
  const div = document.createElement("div");
  div.className = `mock-msg ${who}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ---------- Go ----------
boot();
