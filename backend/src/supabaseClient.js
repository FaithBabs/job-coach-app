// This file creates one shared connection to the Supabase database,
// using the "service_role" key — which can read/write ANY row, bypassing
// the per-user lock rules (RLS policies) we set up in SQL.
//
// That's intentional: the backend is trusted code. It decides what a user
// is allowed to do (by checking their login token) before it touches the
// database on their behalf. This key must NEVER be sent to the frontend
// or exposed in browser code.

const { createClient } = require("@supabase/supabase-js");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = { supabaseAdmin };
