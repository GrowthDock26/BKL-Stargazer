import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use anon key client for auth verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user has admin role using service role client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: isAdmin, error: roleError } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (roleError || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, data, id } = await req.json();

    console.log('Knowledge management action:', action);

    // Use service role client for all DB operations (bypasses RLS)
    switch (action) {
      case 'list': {
        const { data: docs, error } = await supabaseAdmin
          .from('knowledge_documents')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return new Response(JSON.stringify({ documents: docs }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'create': {
        const { error } = await supabaseAdmin
          .from('knowledge_documents')
          .insert([{
            title: data.title,
            content: data.content,
            category: data.category || null,
            tags: data.tags || null
          }]);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'update': {
        const { error } = await supabaseAdmin
          .from('knowledge_documents')
          .update({
            title: data.title,
            content: data.content,
            category: data.category || null,
            tags: data.tags || null
          })
          .eq('id', id);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete': {
        const { error } = await supabaseAdmin
          .from('knowledge_documents')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error in knowledge-management:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
