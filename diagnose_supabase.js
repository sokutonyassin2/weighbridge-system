const https = require('https');

const SUPABASE_URL = "vsgtvcvzijuehawpodhz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA";

function request(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: SUPABASE_URL,
            path: path,
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ body, statusCode: res.statusCode, headers: res.headers }));
        });

        req.on('error', reject);
        req.end();
    });
}

(async () => {
    try {
        console.log('--- FETCHING LAST 5 CAMERA AUDIT LOGS ---');
        const logsRes = await request('/rest/v1/camera_audit_logs?select=*&order=timestamp.desc&limit=5');
        console.log(logsRes.body);

        console.log('\n--- FETCHING LAST 5 VEHICLE ENTRIES ---');
        const entriesRes = await request('/rest/v1/vehicle_entries?select=id,vehicle_no,entry_time&order=entry_time.desc&limit=5');
        console.log(entriesRes.body);
    } catch (err) {
        console.error(err);
    }
})();
