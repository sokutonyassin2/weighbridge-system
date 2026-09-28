import { createClient } from "@supabase/supabase-js";

const url = "https://vsgtvcvzijuehawpodhz.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA";
const supabase = createClient(url, key);

async function check() {
  const { data: sheets, error: err1 } = await supabase
    .from("logistics_trip_sheets")
    .select("id, reference_number, status, vehicle_id")
    .limit(20);
  console.log("Recent sheets:", sheets, err1);

  const { data: orders, error: err2 } = await supabase
    .from("logistics_trip_orders")
    .select("id, order_number, trip_number, truck_reg, client_name, status")
    .limit(20);
  console.log("Recent orders:", orders, err2);
}

check();
