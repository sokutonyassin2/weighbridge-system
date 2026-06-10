import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vsgtvcvzijuehawpodhz.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Deleting garage_requisitions...");
  // Since we might not be able to delete everything due to RLS or foreign keys, we try to soft delete first, then hard delete if possible.
  // Actually, let's just do a hard delete.
  const { error: err1 } = await supabase.from('garage_requisitions').delete().neq('id', 'dummy');
  if (err1) console.error("Error deleting garage_requisitions:", err1.message);

  console.log("Deleting garage_job_faults...");
  const { error: err2 } = await supabase.from('garage_job_faults').delete().neq('id', 'dummy');
  if (err2) console.error("Error deleting garage_job_faults:", err2.message);

  console.log("Deleting garage_job_cards...");
  const { error: err3 } = await supabase.from('garage_job_cards').delete().neq('id', 'dummy');
  if (err3) console.error("Error deleting garage_job_cards:", err3.message);
  
  console.log("Done.");
}

run();
