
async function checkSchema() {
  const url = 'https://vsgtvcvzijuehawpodhz.supabase.co/rest/v1';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA';
  
  try {
    const tables = ['logistics_trips', 'logistics_trip_events', 'logistics_trip_sheets'];
    for (const table of tables) {
      const tRes = await fetch(`${url}/${table}?limit=0`, {
        headers: { 'apikey': key }
      });
      console.log(`TABLE ${table}:`, tRes.status === 200 ? 'EXISTS' : `MISSING (${tRes.status})`);
    }
  } catch (err) {
    console.error(err);
  }
}
checkSchema();
