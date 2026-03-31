import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const { priceId, billingType } = await req.json();
    if (!priceId) throw new Error("Price ID is required");
    const normalizedBillingType = billingType === "one_time" ? "one_time" : "recurring";

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const session = await stripe.checkout.sessions.create(
      normalizedBillingType === "one_time"
        ? {
            customer: customerId,
            customer_email: customerId ? undefined : user.email,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "payment",
            success_url: `${req.headers.get("origin")}/dashboard?checkout=success`,
            cancel_url: `${req.headers.get("origin")}/dashboard?checkout=canceled`,
          }
        : {
            customer: customerId,
            customer_email: customerId ? undefined : user.email,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "subscription",
            subscription_data: {
              trial_period_days: 7,
            },
            success_url: `${req.headers.get("origin")}/dashboard?checkout=success`,
            cancel_url: `${req.headers.get("origin")}/dashboard?checkout=canceled`,
          }
    );

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
