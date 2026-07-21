// Shared helper for every feature that talks to Claude. Each app feature
// (tailored resume, LinkedIn suggestions, Q&A prep, mock interview) is just
// a different "trigger command" from the coaching prompt, sent as a normal
// chat message alongside the candidate's resume/job posting/preferences.

const { anthropic } = require("./anthropicClient");
const { COACHING_SYSTEM_PROMPT } = require("./prompts/coachingPrompt");

const MODEL = "claude-sonnet-5";

// Turns the user's saved preferences into plain-English context Claude can use
// (e.g. to prioritize negotiation points or flag dealbreakers).
function describePreferences(preferences) {
  if (!preferences) return "Not provided.";
  const salary =
    preferences.salary_min || preferences.salary_max
      ? `${preferences.salary_min ?? "?"}–${preferences.salary_max ?? "?"} (${preferences.salary_unit || "yearly"})`
      : "Not specified.";
  return [
    `Target salary: ${salary}`,
    `Must-haves: ${preferences.must_haves || "none listed"}`,
    `Nice-to-haves: ${preferences.nice_to_haves || "none listed"}`,
    `Dealbreakers: ${preferences.dealbreakers || "none listed"}`,
  ].join("\n");
}

function buildCandidateBlock({ resumeText, jobPostingText, preferences, companyName, roleTitle }) {
  return `
# Candidate Parameters
Target Industry / Role Type: ${roleTitle || "See resume/job posting"}
Company: ${companyName || "Not specified"}
Salary & Preferences:
${describePreferences(preferences)}

# Candidate's Master Resume
${resumeText}

# Target Job Posting
${jobPostingText}
`.trim();
}

// mode: "optimize" | "linkedin" | "qaprep" | "prep"
// extraMessages: for mock interview mode, the running back-and-forth so far
async function runCoachingMode({ mode, resumeText, jobPostingText, preferences, companyName, roleTitle, extraMessages = [] }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key is not configured on the server yet.");
  }

  const candidateBlock = buildCandidateBlock({ resumeText, jobPostingText, preferences, companyName, roleTitle });

  const openingMessage = `/${mode}\n\n${candidateBlock}`;

  const messages = [{ role: "user", content: openingMessage }, ...extraMessages];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: COACHING_SYSTEM_PROMPT,
    messages,
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

module.exports = { runCoachingMode };
