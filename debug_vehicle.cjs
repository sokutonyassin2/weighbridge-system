const fs = require('fs');

async function test() {
    console.log("Fetching WB records...");
    const env = fs.readFileSync('.env', 'utf8');
    const url = env.split('\n').map(l => l.trim()).find(l => l.startsWith('VITE_SUPABASE_URL=')).split('=')[1].replace(/^"(.*)"$/, '$1');
    const key = env.split('\n').map(l => l.trim()).find(l => l.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')).split('=')[1].replace(/^"(.*)"$/, '$1');

    async function query(path) {
        const res = await fetch(`${url}/rest/v1/${path}`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            }
        });
        return await res.json();
    }

    // Try multiple numbers around 2068
    const entries = await query(`vehicle_entries?wb_number=in.(2067,2068,2069,2070)&select=*`);

    // Also check vehicle_no exactly
    const entryByNo = await query(`vehicle_entries?vehicle_no=eq.T855BCM&select=*`);

    const result = {
        entries,
        entryByNo
    };

    fs.writeFileSync('debug_result.json', JSON.stringify(result, null, 2));
    console.log("Done. Results saved to debug_result.json");
}

test().catch(console.error);
