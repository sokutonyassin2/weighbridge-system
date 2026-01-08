import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entry_id, vehicle_no, weigh_number } = await req.json();

    console.log(`[Camera Capture] Starting capture for vehicle ${vehicle_no}, entry ${entry_id}`);

    // Get camera configuration from environment
    const cameraIp = Deno.env.get('CAMERA_IP') || '192.168.1.160';
    const cameraUsername = Deno.env.get('CAMERA_USERNAME') || 'admin';
    const cameraPassword = Deno.env.get('CAMERA_PASSWORD') || 'sood12345';
    const cameraSnapshotPath = Deno.env.get('CAMERA_SNAPSHOT_PATH') || '/cgi-bin/snapshot.cgi';
    
    const cameraUrl = `http://${cameraIp}${cameraSnapshotPath}`;
    console.log(`[Camera Capture] Connecting to camera at ${cameraIp}`);

    // Create Basic Auth header
    const authHeader = 'Basic ' + btoa(`${cameraUsername}:${cameraPassword}`);

    // Capture image from camera
    let imageData: ArrayBuffer;
    let contentType = 'image/jpeg';
    
    try {
      const cameraResponse = await fetch(cameraUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        },
      });

      if (!cameraResponse.ok) {
        throw new Error(`Camera returned status ${cameraResponse.status}: ${cameraResponse.statusText}`);
      }

      contentType = cameraResponse.headers.get('content-type') || 'image/jpeg';
      imageData = await cameraResponse.arrayBuffer();
      
      console.log(`[Camera Capture] Successfully captured image (${imageData.byteLength} bytes)`);
    } catch (cameraError: unknown) {
      const errorMessage = cameraError instanceof Error ? cameraError.message : 'Unknown camera error';
      console.error(`[Camera Capture] Camera error: ${errorMessage}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Camera connection failed: ${errorMessage}`,
        camera_ip: cameraIp,
        suggestion: 'Please verify camera IP, credentials, and network connectivity'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedVehicleNo = vehicle_no.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${sanitizedVehicleNo}/${timestamp}_weigh${weigh_number || 1}.jpg`;

    console.log(`[Camera Capture] Uploading to storage: ${filename}`);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('vehicle-photos')
      .upload(filename, imageData, {
        contentType: contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[Camera Capture] Storage upload error: ${uploadError.message}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Storage upload failed: ${uploadError.message}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('vehicle-photos')
      .getPublicUrl(filename);

    console.log(`[Camera Capture] Upload successful: ${publicUrl}`);

    // Update weigh_records with photo URL if entry_id provided
    if (entry_id) {
      const { error: updateError } = await supabase
        .from('weigh_records')
        .update({ photo_url: publicUrl })
        .eq('entry_id', entry_id)
        .eq('weigh_number', weigh_number || 1);

      if (updateError) {
        console.warn(`[Camera Capture] Could not update weigh record: ${updateError.message}`);
      } else {
        console.log(`[Camera Capture] Updated weigh record with photo URL`);
      }
    }

    // Log the capture action
    const authHeader2 = req.headers.get('Authorization');
    if (authHeader2) {
      const token = authHeader2.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      
      if (user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          user_name: user.user_metadata?.full_name || 'Unknown',
          user_role: 'operator',
          action: 'Vehicle Photo Captured',
          details: `Photo captured for vehicle ${vehicle_no} (Entry: ${entry_id})`
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      photoUrl: publicUrl,
      photo_url: publicUrl,
      filename: filename,
      size_bytes: imageData.byteLength,
      vehicle_no: vehicle_no,
      entry_id: entry_id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Camera Capture] Unexpected error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
