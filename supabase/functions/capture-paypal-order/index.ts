import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    if (!userData.user?.email) throw new Error("User not authenticated");

    const { orderId } = await req.json();
    if (!orderId) throw new Error("Order ID is required");

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
      throw new Error(authJson.error_description || "Failed to authenticate with PayPal");
    }

    const orderRes = await fetch(`${paypalBase}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authJson.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const orderJson = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(orderJson.message || "Failed to load PayPal order");
    }

    const customId: string | undefined = orderJson.purchase_units?.[0]?.custom_id;
    const referenceId: string | undefined = orderJson.purchase_units?.[0]?.reference_id;
    const [, planKeyFromCustom] = (customId || "").split(":");
    const plan = referenceId || planKeyFromCustom || "growth";

    const captureRes = await fetch(`${paypalBase}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authJson.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const captureJson = await captureRes.json();

    if (!captureRes.ok) {
      throw new Error(captureJson.message || "Failed to capture PayPal payment");
    }

    const nowIso = new Date().toISOString();
    const periodEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const captureId =
      captureJson.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? orderId;

    const { error: subError } = await supabase
      .from("subscriptions")
      .update({
        plan,
        status: "active",
        current_period_start: nowIso,
        current_period_end: periodEndIso,
        trial_start: nowIso,
        trial_end: periodEndIso,
      })
      .eq("user_id", userData.user.id);
    if (subError) {
      throw new Error(`Failed to update subscription: ${subError.message}`);
    }

    const amountValue = Number(captureJson.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? "0");
    const currency = captureJson.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code ?? "USD";

    const { error: invoiceError } = await supabase.from("invoices").insert({
      user_id: userData.user.id,
      amount: amountValue,
      currency,
      description: `PayPal payment (${plan})`,
      invoice_date: nowIso,
      due_date: nowIso,
      status: "paid",
      paid_at: nowIso,
      stripe_invoice_id: `paypal:${captureId}`,
    });
    if (invoiceError) {
      throw new Error(`Failed to create invoice: ${invoiceError.message}`);
    }

    return new Response(
      JSON.stringify({
        status: captureJson.status,
        orderId: captureJson.id,
        captureId,
        plan,
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
