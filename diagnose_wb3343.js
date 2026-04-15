
const url = 'https://vsgtvcvzijuehawpodhz.supabase.co/rest/v1';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA';

async function diagnose() {
  try {
    console.log('--- FETCHING LAST 10 ENTRIES ---');
    
    // Fetch last 10 entries
    const entryRes = await fetch(`${url}/vehicle_entries?select=*,vehicle_types(*)&order=id.desc&limit=10`, {
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    const entries = await entryRes.json();
    console.log('ENTRIES_LIST:', JSON.stringify(entries, null, 2));

  } catch (err) {
    console.error('DIAGNOSE_ERROR:', err.message);
  }
}

diagnose();
