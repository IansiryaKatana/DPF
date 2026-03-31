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
    if (userError || !userData.user?.id) {
      return new Response(JSON.stringify({ error: `Authentication error: ${userError?.message ?? "Unknown"}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { subscriptionId, planKey } = await req.json();
    if (!subscriptionId || !planKey) throw new Error("subscriptionId and planKey are required");
    if (!PLAN_PRICES[planKey]) throw new Error("Recurring PayPal is supported only for Growth and Pro");

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["paypal_client_id", "paypal_client_secret", "paypal_sandbox_mode"]);
    if (settingsError) throw new Error(`Failed to load PayPal settings: ${settingsError.message}`);

    const getSetting = (key: string) => settings?.find((s) => s.setting_key === key)?.setting_value ?? "";
    const clientId = getSetting("paypal_client_id");
    const clientSecret = getSetting("paypal_client_secret");
    const sandboxMode = getSetting("paypal_sandbox_mode") !== "false";
    if (!clientId || !clientSecret) throw new Error("PayPal credentials are missing in admin settings");

    const paypalBase = sandboxMode ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

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
      throw new Error(authJson.error_description || "Failed to authenticate with PayPal");
    }

    const subRes = await fetch(`${paypalBase}/v1/billing/subscriptions/${subscriptionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authJson.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const subJson = await subRes.json();
    if (!subRes.ok) throw new Error(subJson.message || "Failed to load PayPal subscription");

    const nowIso = new Date().toISOString();
    const nextBilling = subJson.billing_info?.next_billing_time || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const paypalPayerId = subJson.subscriber?.payer_id || "";

    const { error: subError } = await supabase
      .from("subscriptions")
      .update({
        plan: planKey,
        status: "active",
        current_period_start: nowIso,
        current_period_end: nextBilling,
        trial_start: nowIso,
        trial_end: nextBilling,
        stripe_subscription_id: `paypal_sub:${subscriptionId}`,
        stripe_customer_id: paypalPayerId ? `paypal_cus:${paypalPayerId}` : null,
      })
      .eq("user_id", userData.user.id);
    if (subError) throw new Error(`Failed to update subscription: ${subError.message}`);

    const amountValue = PLAN_PRICES[planKey];
    const { error: invoiceError } = await supabase.from("invoices").insert({
      user_id: userData.user.id,
      amount: amountValue,
      currency: "USD",
      description: `PayPal recurring subscription (${planKey})`,
      invoice_date: nowIso,
      due_date: nowIso,
      status: "paid",
      paid_at: nowIso,
      stripe_invoice_id: `paypal_sub:${subscriptionId}`,
    });
    if (invoiceError) throw new Error(`Failed to create invoice: ${invoiceError.message}`);

    return new Response(
      JSON.stringify({
        status: subJson.status,
        subscriptionId,
        next_billing_time: nextBilling,
        plan: planKey,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
