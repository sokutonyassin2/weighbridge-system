const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const env = fs.readFileSync(".env", "utf8");
let url = "", key = "";
env.split("\n").forEach(line => {
  const parts = line.split("=");
  if (parts[0] && parts[0].trim() === "VITE_SUPABASE_URL") {
    url = parts.slice(1).join("=").trim().replace(/^["']/, "").replace(/["']$/, "");
  }
  if (parts[0] && parts[0].trim() === "VITE_SUPABASE_ANON_KEY") {
    key = parts.slice(1).join("=").trim().replace(/^["']/, "").replace(/["']$/, "");
  }
});

const sb = createClient(url, key);

async function check() {
  console.log("Checking 981...");
  const { data: sheets, error: sErr } = await sb
    .from("logistics_trip_sheets")
    .select("id, trip_number, reference_number, total_expenses_tzs, total_expenses_usd, fuel_liters, fuel_price, status, invoice_no")
    .or("reference_number.ilike.%981%,trip_number.ilike.%981%");
  
  if (sErr) console.error("Sheets error:", sErr);
  console.log("Trip Sheets found:", JSON.stringify(sheets, null, 2));

  const { data: orders, error: oErr } = await sb
    .from("logistics_trip_orders")
    .select("id, trip_number, destination, agreed_amount_usd, status")
    .ilike("trip_number", "%981%");
    
  if (oErr) console.error("Orders error:", oErr);
  console.log("Orders found:", JSON.stringify(orders, null, 2));

  if (sheets && sheets.length > 0) {
    const { data: expenses } = await sb
      .from("logistics_trip_expenses")
      .select("id, trip_sheet_id, category, item_name, amount, currency, is_extra")
      .eq("trip_sheet_id", sheets[0].id);
    console.log("Trip sheet expenses items:", JSON.stringify(expenses, null, 2));
  }
}

check();
