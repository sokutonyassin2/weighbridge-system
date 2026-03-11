const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVehicle(vehicleNo) {
    console.log(`Checking vehicle: ${vehicleNo}...`);

    // 1. Check vehicle_entries
    const { data: entries, error: entriesError } = await supabase
        .from('vehicle_entries')
        .select('*')
        .ilike('vehicle_no', vehicleNo)
        .order('created_at', { ascending: false });

    if (entriesError) console.error('Error fetching entries:', entriesError);
    else {
        console.log('\n--- Vehicle Entries ---');
        entries.forEach(e => {
            console.log(`ID: ${e.id}, WB: ${e.wb_number}, Status: ${e.status}, Completed: ${e.completed}, Penalty Paid: ${e.penalty_paid_entry}, Created: ${e.created_at}`);
        });
    }

    // 2. Check payments
    const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .ilike('vehicle_no', vehicleNo)
        .order('created_at', { ascending: false });

    if (paymentsError) console.error('Error fetching payments:', paymentsError);
    else {
        console.log('\n--- Payments ---');
        payments.forEach(p => {
            console.log(`ID: ${p.id}, Type: ${p.payment_type}, Amount: ${p.amount}, Status: ${p.payment_status}, Entry ID: ${p.entry_id}, Paid At: ${p.paid_at}`);
        });
    }

    // 3. Check pending_weighs
    const { data: pending, error: pendingError } = await supabase
        .from('pending_weighs')
        .select('*')
        .ilike('vehicle_no', vehicleNo);

    if (pendingError) console.error('Error fetching pending weighs:', pendingError);
    else {
        console.log('\n--- Pending Weighs ---');
        pending.forEach(pw => {
            console.log(`ID: ${pw.id}, Entry ID: ${pw.entry_id}, Attempts: ${pw.weigh_attempts}, Payment Required: ${pw.payment_required}`);
        });
    }
}

checkVehicle('RAJ844E');
