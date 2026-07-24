const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
async function run() {
    const { data, error } = await supabase.from('garage_requisitions').select('status, id').limit(10);
    if (error) console.error(error);
    else console.log("Rows:", data.length);
}
run();
