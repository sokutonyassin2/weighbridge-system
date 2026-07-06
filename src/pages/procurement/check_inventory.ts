import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = "https://vsgtvcvzijuehawpodhz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    try {
        console.log("Fetching requisitions...");
        const { data: reqs, error: reqErr } = await supabase
            .from('garage_requisitions')
            .select('*');
            
        if (reqErr) throw reqErr;
        
        console.log("Total Requisitions:", reqs.length);
        
        const statusCounts = {};
        for(const req of reqs) {
            statusCounts[req.status] = (statusCounts[req.status] || 0) + 1;
        }
        console.log("Statuses:", statusCounts);
        
        const arrivedReqs = reqs.filter(r => r.status === 'Arrived');
        console.log("Arrived Requisitions:");
        console.log(JSON.stringify(arrivedReqs, null, 2));

        const approvedReqs = reqs.filter(r => r.status === 'Approved');
        console.log("Approved Requisitions:");
        console.log(JSON.stringify(approvedReqs, null, 2));

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
