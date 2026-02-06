import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.40.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Parse request body ONCE
    const body = await req.json();
    const {
      email,
      password,
      fullName,
      username,
      role,
      action,
      userId,
      isActive
    } = body;

    console.log(`Processing action: ${action || 'create-user'} for user: ${username || userId || 'unknown'}`);

    // --- Action: Reset Password ---
    if (action === 'reset-password') {
      if (!userId || !password) {
        return new Response(JSON.stringify({ error: 'Missing userId or password' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, message: 'Password reset ok' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Update User ---
    if (action === 'update-user') {
      if (!userId || !fullName || !role) {
        return new Response(JSON.stringify({ error: 'Missing required fields for update' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update Auth Metadata
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: fullName }
      });
      if (authErr) throw authErr;

      // Update Profile
      const { error: profErr } = await supabaseAdmin
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', userId);
      if (profErr) throw profErr;

      // Update Role (Safe Delete then Insert pattern)
      console.log(`Updating role for user ${userId} to: ${role}`);

      // 1. Remove any existing roles to ensure a clean state
      const { error: delErr } = await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (delErr) {
        console.error('Role deletion error:', delErr);
        throw delErr;
      }

      // 2. Insert the new single role
      const { error: roleErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role });

      if (roleErr) {
        console.error('Role update error:', roleErr);
        return new Response(JSON.stringify({
          error: `Database rejected role '${role}'.`,
          details: roleErr.message
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Toggle Active ---
    if (action === 'toggle-active') {
      if (!userId || isActive === undefined) {
        return new Response(JSON.stringify({ error: 'Missing userId or isActive' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: updErr } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);
      if (updErr) throw updErr;

      return new Response(JSON.stringify({ success: true, isActive }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Delete User ---
    if (action === 'delete-user') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) throw delErr;

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Create User (Default) ---
    if (!email || !password || !fullName || !username || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields for registration' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        username: username.toLowerCase(),
      },
    });

    if (authError) {
      console.error('Registration failed:', authError.message);
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!authData.user) throw new Error('User creation succeeded but no user returned');

    // Create Profile (explicit creation to ensure it exists)
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authData.user.id,
      full_name: fullName,
      username: username.toLowerCase(),
      is_active: true,
    });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't fail if profile already exists (trigger might have created it)
      if (!profileError.message.includes('duplicate key')) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw new Error('Failed to create profile: ' + profileError.message);
      }
    }

    // Assign Role
    const { error: roleInsertErr } = await supabaseAdmin.from('user_roles').insert({
      user_id: authData.user.id,
      role: role,
    });

    if (roleInsertErr) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new Error('Failed to assign role: ' + roleInsertErr.message);
    }

    return new Response(JSON.stringify({
      success: true,
      user: { id: authData.user.id, username }
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Function execution error:', error.message);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
