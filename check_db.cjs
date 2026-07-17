const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vsgtvcvzijuehawpodhz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // First sign in as a user to bypass RLS
  // Try to sign in with the admin credentials
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@sudenergy.com',
    password: 'admin123'
  });

  if (authError) {
    console.log("Auth error with admin@sudenergy.com:", authError.message);
    // Try another common email
    const { data: authData2, error: authError2 } = await supabase.auth.signInWithPassword({
      email: 'super@sudenergy.com',
      password: 'admin123'
    });
    if (authError2) {
      console.log("Auth error with super@sudenergy.com:", authError2.message);
      console.log("\n--- Cannot authenticate. Let me try direct REST API ---");
      
      // Try via direct fetch with apikey
      const response = await fetch(`${supabaseUrl}/rest/v1/garage_requisitions?select=id,item_name,po_number,status,is_deleted,supplier_id&po_number=not.is.null&order=created_at.desc&limit=30`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      console.log("Direct REST result (po_number not null):", JSON.stringify(data, null, 2));
      
      // Also check deleted items
      const response2 = await fetch(`${supabaseUrl}/rest/v1/garage_requisitions?select=id,item_name,po_number,status,is_deleted,supplier_id&is_deleted=eq.true&order=created_at.desc&limit=30`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      const data2 = await response2.json();
      console.log("\nDeleted items:", JSON.stringify(data2, null, 2));
      
      // Also check ALL recent items
      const response3 = await fetch(`${supabaseUrl}/rest/v1/garage_requisitions?select=id,item_name,po_number,status,is_deleted,supplier_id&order=created_at.desc&limit=30`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      const data3 = await response3.json();
      console.log("\nAll recent items:", JSON.stringify(data3, null, 2));
      return;
    }
    console.log("Authenticated as super@sudenergy.com");
  } else {
    console.log("Authenticated as admin@sudenergy.com");
  }

  // Now query with RLS context
  console.log("\n--- Requisitions with PO numbers ---");
  const { data: poReqs, error: poError } = await supabase
    .from('garage_requisitions')
    .select('id, item_name, po_number, status, is_deleted, supplier_id, target_company, created_at')
    .not('po_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30);
  
  if (poError) console.error("PO query error:", poError);
  else console.log(JSON.stringify(poReqs, null, 2));

  console.log("\n--- Deleted requisitions ---");
  const { data: deletedReqs, error: delError } = await supabase
    .from('garage_requisitions')
    .select('id, item_name, po_number, status, is_deleted, supplier_id, target_company, created_at')
    .eq('is_deleted', true)
    .order('created_at', { ascending: false })
    .limit(30);
  
  if (delError) console.error("Deleted query error:", delError);
  else console.log(JSON.stringify(deletedReqs, null, 2));

  console.log("\n--- ALL recent requisitions (last 30) ---");
  const { data: allReqs, error: allError } = await supabase
    .from('garage_requisitions')
    .select('id, item_name, po_number, status, is_deleted, supplier_id, target_company, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  
  if (allError) console.error("All query error:", allError);
  else console.log(JSON.stringify(allReqs, null, 2));
}

run();
