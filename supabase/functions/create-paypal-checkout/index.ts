import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PRICES: Record<string, number> = {
  growth: 500,
  pro: 700,
  enterprise: 12000,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) {
      return new Response(JSON.stringify({ error: `Authentication error: ${userError.message}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    if (!userData.user?.email) throw new Error("User not authenticated");

    const { planKey } = await req.json();
    if (!planKey || !PLAN_PRICES[planKey]) throw new Error("Invalid plan");

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["paypal_client_id", "paypal_client_secret", "paypal_sandbox_mode"]);

    if (settingsError) throw new Error(`Failed to load PayPal settings: ${settingsError.message}`);

    const getSetting = (key: string) =>
      settings?.find((s) => s.setting_key === key)?.setting_value ?? "";

    const clientId = getSetting("paypal_client_id");
    const clientSecret = getSetting("paypal_client_secret");
    const sandboxMode = getSetting("paypal_sandbox_mode") !== "false";

    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials are missing in admin settings");
    }

    const paypalBase = sandboxMode
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";

    const authRes = await fetch(`${paypalBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const authJson = await authRes.json();
    if (!authRes.ok || !authJson.access_token) {
      const envHint = sandboxMode
        ? "Using PayPal Sandbox API: ensure Admin stores the Sandbox Client ID and Secret, and Sandbox mode is ON."
        : "Using PayPal Live API: ensure Admin stores Live Client ID and Secret, and Sandbox mode is OFF.";
      const paypalMsg =
        authJson.error_description || authJson.error || "Failed to authenticate with PayPal";
      throw new Error(`${paypalMsg} ${envHint}`);
    }

    const amount = PLAN_PRICES[planKey].toFixed(2);
    const origin = req.headers.get("origin") || "http://localhost:8081";

    const orderRes = await fetch(`${paypalBase}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authJson.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: `${userData.user.id}:${planKey}`,
            reference_id: planKey,
            amount: {
              currency_code: "USD",
              value: amount,
            },
            description: `DataPulseFlow ${planKey} plan`,
          },
        ],
        application_context: {
          return_url: `${origin}/dashboard?checkout=paypal-success`,
          cancel_url: `${origin}/dashboard?checkout=paypal-canceled`,
          brand_name: "DataPulseFlow",
          user_action: "PAY_NOW",
        },
      }),
    });

    const orderJson = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(orderJson.message || "Failed to create PayPal checkout");
    }

    const approvalUrl = orderJson.links?.find((l: { rel: string; href: string }) => l.rel === "approve")?.href;
    if (!approvalUrl) throw new Error("PayPal approval URL missing");

    return new Response(JSON.stringify({ url: approvalUrl, orderId: orderJson.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
