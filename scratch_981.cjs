const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const env = fs.readFileSync(".env", "utf8");
let url = "", key = "";
env.split("\n").forEach(line => {
  const parts = line.split("=");
  const k = parts[0]?.trim();
  const v = parts.slice(1).join("=").trim().replace(/^["']/, "").replace(/["']$/, "");
  if (k === "VITE_SUPABASE_URL") url = v;
  if (k === "VITE_SUPABASE_PUBLISHABLE_KEY" || k === "VITE_SUPABASE_ANON_KEY") key = v;
});

const sb = createClient(url, key);

async function check() {
  const { data: sheets, error: sErr } = await sb
    .from("logistics_trip_sheets")
    .select("id, reference_number, total_expenses_tzs, total_expenses_usd, destination, status, invoice_no")
    .order("created_at", { ascending: false })
    .limit(30);
  console.log("Sheets error:", sErr);
  console.log("Sheets count:", sheets?.length);
  console.log("Recent Sheets:", sheets);
}
check();
