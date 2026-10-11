const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://vsgtvcvzijuehawpodhz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA'
);

async function run() {
  const { data: orders } = await supabase
    .from('logistics_trip_orders')
    .select('id, trip_number, agreed_amount_usd, go_amount_usd, return_amount_usd, truck_reg')
    .ilike('trip_number', '%G006%');
  console.log('ORDERS:', JSON.stringify(orders, null, 2));

  const { data: sheets } = await supabase
    .from('logistics_trip_sheets')
    .select('id, reference_number, revenue_amount, revenue_currency, journey_type')
    .ilike('reference_number', '%G006%');
  console.log('SHEETS:', JSON.stringify(sheets, null, 2));

  const { data: orders8 } = await supabase
    .from('logistics_trip_orders')
    .select('id, trip_number, agreed_amount_usd, go_amount_usd, return_amount_usd, truck_reg')
    .ilike('trip_number', '%G008%');
  console.log('ORDERS 8:', JSON.stringify(orders8, null, 2));

  const { data: sheets8 } = await supabase
    .from('logistics_trip_sheets')
    .select('id, reference_number, revenue_amount, revenue_currency, journey_type')
    .ilike('reference_number', '%G008%');
  console.log('SHEETS 8:', JSON.stringify(sheets8, null, 2));
}

run();
