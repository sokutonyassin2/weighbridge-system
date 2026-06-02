const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/"/g, '');
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim()?.replace(/"/g, '') || env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/)[1].trim().replace(/"/g, '');

fetch(url + '/rest/v1/logistics_transit_trips?select=*,trip_sheet:logistics_trip_sheets(return_invoice_no)&limit=1', {
  headers: {
    apikey: key,
    Authorization: 'Bearer ' + key
  }
})
.then(r => r.text())
.then(console.log)
.catch(console.error);
