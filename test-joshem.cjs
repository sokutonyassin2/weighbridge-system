const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function run() {
    const { data: suppliers, error: sErr } = await supabase.from('garage_suppliers').select('*').ilike('name', '%JOSHEM%');
    if (sErr) console.error(sErr);
    else console.log("Suppliers found:", suppliers);

    if (suppliers && suppliers.length > 0) {
        const joshem = suppliers[0];
        const { data: pm, error: pErr } = await supabase.from('garage_supplier_payment_methods').select('*').eq('supplier_id', joshem.id);
        if (pErr) console.error(pErr);
        else console.log("Payment methods:", pm);
    }
}
run();
