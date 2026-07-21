// This function runs before any "protected" route (like "get my resume"
// or "tailor a resume"). It checks the login token the frontend sends,
// asks Supabase "who is this, really?", and attaches that user's info
// to the request. If there's no valid token, it blocks the request.
//
// This is how we make sure User A can never see User B's data.

const { supabaseAdmin } = require("../supabaseClient");

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Not logged in." });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  req.user = data.user; // now available in every route as req.user.id / req.user.email
  next();
}

module.exports = { requireAuth };
