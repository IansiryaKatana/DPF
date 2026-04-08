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
    const buildAccessCode = () => {
      const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const chunk = (size: number) =>
        Array.from({ length: size }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
      return `DPF-${chunk(4)}-${chunk(4)}-${chunk(4)}`;
    };

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

    const { reference } = await req.json();
    if (!reference) throw new Error("Paystack reference is required");

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["paystack_secret_key"]);
    if (settingsError) throw new Error(`Failed to load Paystack settings: ${settingsError.message}`);

    const paystackSecret = settings?.find((s) => s.setting_key === "paystack_secret_key")?.setting_value ?? "";
    if (!paystackSecret) throw new Error("Paystack secret key is missing in admin settings");

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson?.status || !verifyJson?.data) {
      throw new Error(verifyJson?.message || "Failed to verify Paystack payment");
    }

    const payment = verifyJson.data;
    if (payment.status !== "success") {
      throw new Error("Paystack payment is not successful");
    }

    const expectedInvoiceRef = `paystack:${reference}`;
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("stripe_invoice_id", expectedInvoiceRef)
      .maybeSingle();

    if (existingInvoice?.id) {
      return new Response(
        JSON.stringify({
          status: "COMPLETED",
          alreadyProcessed: true,
          reference,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const plan = String(payment?.metadata?.planKey || "growth");
    const nowIso = new Date().toISOString();
    const isEnterprise = plan === "enterprise";
    const periodEndIso = isEnterprise
      ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const accessCode = buildAccessCode();

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

    const amountValue = Number(payment.amount || 0) / 100;
    const currency = String(payment.currency || "USD").toUpperCase();

    const { error: invoiceError } = await supabase.from("invoices").insert({
      user_id: userData.user.id,
      amount: amountValue,
      currency,
      description: `Paystack payment (${plan})`,
      invoice_date: nowIso,
      due_date: nowIso,
      status: "paid",
      paid_at: nowIso,
      stripe_invoice_id: expectedInvoiceRef,
    });
    if (invoiceError) {
      throw new Error(`Failed to create invoice: ${invoiceError.message}`);
    }

    const { error: codeError } = await supabase.from("client_access_codes").insert({
      user_id: userData.user.id,
      code: accessCode,
      plan,
      status: "active",
      issued_at: nowIso,
      expires_at: periodEndIso,
    });
    if (codeError) {
      throw new Error(`Failed to issue access code: ${codeError.message}`);
    }

    return new Response(
      JSON.stringify({
        status: "COMPLETED",
        reference,
        plan,
        lifetime: isEnterprise,
        accessCode,
        accessCodeExpiresAt: periodEndIso,
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
