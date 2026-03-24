const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Try loading various env files manually since dotenv behaves differently
let envContent = '';
if (fs.existsSync('.env.local')) {
    envContent = fs.readFileSync('.env.local', 'utf-8');
} else if (fs.existsSync('.env')) {
    envContent = fs.readFileSync('.env', 'utf-8');
}

const envParams = dotenv.parse(envContent);

const supabaseUrl = envParams.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = envParams.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWeighs() {
    const vehicleNo = 'RAJ843E';

    // Find the entry ID
    const { data: entries, error: entryError } = await supabase
        .from('vehicle_entries')
        .select('id, wb_number, entry_time')
        .eq('vehicle_no', vehicleNo)
        .order('created_at', { ascending: false })
        .limit(1);

    if (entryError || !entries || entries.length === 0) {
        console.log("Could not find active entry for RAJ843E");
        return;
    }

    const entryId = entries[0].id;
    console.log(`Found Entry: WB-${entries[0].wb_number}`);
    console.log(`Arrival Time: ${new Date(entries[0].entry_time).toLocaleString()}`);
    console.log('-----------------------------------');

    // Fetch weigh records
    const { data: weighs, error: weighError } = await supabase
        .from('weigh_records')
        .select('*')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: true });

    if (weighError) {
        console.error("Error fetching weighs:", weighError);
        return;
    }

    if (weighs.length === 0) {
        console.log("No weigh records found.");
    } else {
        weighs.forEach((w, index) => {
            console.log(`Weigh #${index + 1}:`);
            console.log(`  Time Captured: ${new Date(w.created_at).toLocaleString()}`);
            console.log(`  Gross: ${w.gross_weight} kg | Tare: ${w.tare_weight} kg | Net: ${w.net_weight} kg`);
            console.log(`  System Flag: ${w.warning_flag ? 'WARNING/REJECTED' : 'ACCEPTED'}`);
            console.log(`  Notes: ${w.exceedence_notes || 'None'}`);
            console.log('-----------------------------------');
        });
    }
}

checkWeighs();
