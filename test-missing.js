const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
    const { data, error } = await supabase.from('garage_requisitions').select('*').eq('status', 'Pending').eq('is_deleted', false);
    if (error) console.error(error);
    else console.log(JSON.stringify(data.map(d => ({id: d.id, item_name: d.item_name, unit_price: d.unit_price, created_at: d.created_at})), null, 2));
}
run();
