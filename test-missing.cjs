const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
async function run() {
    const { data, error } = await supabase.from('garage_requisitions').select('*').eq('status', 'Pending').eq('is_deleted', false);
    if (error) console.error(error);
    else {
        console.log("Pending items count:", data.length);
        const toFix = data.filter(d => d.unit_price > 0 || d.po_number);
        console.log("Items to fix:", toFix.length);
        if (toFix.length > 0) {
            const { error: updErr } = await supabase.from('garage_requisitions').update({ status: 'Reviewed & Pending' }).in('id', toFix.map(t => t.id));
            if (updErr) console.error("Update error:", updErr);
            else console.log("Fixed missing items!");
        }
    }
}
run();
