import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const getVal = (k) => {
  const lines = env.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(k + '=')) {
      return line.slice(k.length + 1).replace(/^["']|["']$/g, '').trim();
    }
  }
  return '';
};

const supabase = createClient(getVal('VITE_SUPABASE_URL'), getVal('VITE_SUPABASE_PUBLISHABLE_KEY'));

async function check() {
  const { data, error } = await supabase
    .from('logistics_trip_sheets')
    .select('id, reference_number, invoice_no, invoice_date, payment_status, revenue_amount, revenue_currency, client_name')
    .or('reference_number.ilike.%G008%,reference_number.ilike.%G009%');
  console.log('Results:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
}

check();
