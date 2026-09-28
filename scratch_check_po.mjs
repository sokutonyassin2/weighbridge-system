import { createClient } from "@supabase/supabase-js";

const url = "https://vsgtvcvzijuehawpodhz.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA";
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase
    .from("garage_requisitions")
    .select("id, item_name, po_number, status, advance_payment, amount_paid, total_price, payment_reference")
    .eq("po_number", "PO-20260923-0001");
  console.log("PO-20260923-0001 rows:", JSON.stringify(data, null, 2), error);
}

check();
