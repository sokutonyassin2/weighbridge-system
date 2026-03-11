const fs = require('fs');

async function test() {
    const env = fs.readFileSync('.env', 'utf8');
    const url = env.split('\n').map(l => l.trim()).find(l => l.startsWith('VITE_SUPABASE_URL=')).split('=')[1].replace(/^"(.*)"$/, '$1');
    const key = env.split('\n').map(l => l.trim()).find(l => l.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')).split('=')[1].replace(/^"(.*)"$/, '$1');

    async function query(path) {
        const res = await fetch(`${url}/rest/v1/${path}`, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
        });
        return await res.json();
    }

    console.log("--- Recent Vehicle Entries ---");
    const entries = await query(`vehicle_entries?select=id,vehicle_no,wb_number,status,completed&order=entry_time.desc&limit=10`);
    console.table(entries);

    console.log("\n--- Recent Pending Weighs ---");
    const pending = await query(`pending_weighs?select=*&limit=10`);
    console.table(pending);
}

test().catch(console.error);
