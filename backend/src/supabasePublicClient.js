// A second Supabase connection, this one using the "publishable" (anon) key.
// Sign-up and login go through THIS client, because that's the normal,
// public-facing door for auth — the service_role client in supabaseClient.js
// is reserved for privileged database reads/writes after someone is already
// logged in and verified.

const { createClient } = require("@supabase/supabase-js");

const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = { supabasePublic };
