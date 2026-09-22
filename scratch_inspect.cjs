const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=([^\r\n]+)/)[1].trim().replace(/['"]/g, '');
const key = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=([^\r\n]+)/)[1].trim().replace(/['"]/g, '');

async function main() {
    const res = await fetch(`${url}/rest/v1/logistics_trip_sheets?select=id,reference_number,status,destination,vehicle_id&order=created_at.desc&limit=100`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    const sheets = await res.json();
    console.log('Total sheets fetched:', sheets?.length);
    const found = sheets?.filter(s => JSON.stringify(s).includes('985'));
    console.log('Found 985 in sheets:', found);

    // Also check status values across all sheets
    const statuses = {};
    sheets?.forEach(s => { statuses[s.status] = (statuses[s.status] || 0) + 1; });
    console.log('Sheet statuses count:', statuses);
}

main();
