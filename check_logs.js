const https = require('https');

const SUPABASE_URL = "vsgtvcvzijuehawpodhz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA";

function fetchRecentLogs() {
    const options = {
        hostname: SUPABASE_URL,
        path: '/rest/v1/camera_audit_logs?select=*&order=timestamp.desc&limit=10',
        method: 'GET',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log('--- RECENT AUDIT LOGS ---');
            console.log(body);
        });
    });

    req.on('error', (e) => console.error(e));
    req.end();
}

function fetchTodayLogs() {
    const today = new Date().toISOString().split('T')[0];
    const options = {
        hostname: SUPABASE_URL,
        path: `/rest/v1/camera_audit_logs?select=count&timestamp=gte.${today}`,
        method: 'GET',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'count=exact'
        }
    };

    const req = https.request(options, (res) => {
        console.log(`Today's status code: ${res.statusCode}`);
        console.log(`Content-Range: ${res.headers['content-range']}`);
    });

    req.on('error', (e) => console.error(e));
    req.end();
}

fetchRecentLogs();
fetchTodayLogs();
