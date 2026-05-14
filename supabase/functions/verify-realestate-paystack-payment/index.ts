import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  augmentPaystackPaymentWithSubscriptionCode,
  fulfillPaystackSubscriptionPayment,
  invoiceAlreadyRecorded,
  parsePaystackMetadata,
  paymentHasPaystackPlan,
} from "../_shared/paystack-subscription-fulfillment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const invoiceKeys = (payment: Record<string, unknown>, reference: string): string[] => {
  const keys: string[] = [];
  if (payment.id != null) keys.push(`paystack:txn:${String(payment.id)}`);
  if (reference) keys.push(`paystack:${reference}`);
  return keys;
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
      { auth: { persistSession: false } },
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

    const payment = verifyJson.data as Record<string, unknown>;
    if (payment.status !== "success") {
      throw new Error("Paystack payment is not successful");
    }

    const keys = invoiceKeys(payment, reference);
    if (await invoiceAlreadyRecorded(supabase, "realestate_invoices", keys)) {
      return new Response(
        JSON.stringify({
          status: "COMPLETED",
          alreadyProcessed: true,
          reference,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const meta = parsePaystackMetadata(payment.metadata);
    const productLineMeta = String(meta.productLine ?? "").toLowerCase();
    if (productLineMeta === "shopify") {
      throw new Error("Use the Shopify dashboard to verify this payment.");
    }

    if (paymentHasPaystackPlan(payment)) {
      const paymentForSub = await augmentPaystackPaymentWithSubscriptionCode(payment, paystackSecret);
      const sub = await fulfillPaystackSubscriptionPayment({
        supabase,
        payment: paymentForSub,
        userId: userData.user.id,
        productLine: "realestate",
      });
      if (sub.alreadyProcessed) {
        return new Response(
          JSON.stringify({ status: "COMPLETED", alreadyProcessed: true, reference }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          status: "COMPLETED",
          reference,
          plan: sub.plan,
          lifetime: false,
          accessCode: sub.accessCode,
          accessCodeExpiresAt: sub.accessCodeExpiresAt,
          billing: "paystack_subscription",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const plan = String(meta.planKey || "growth");
    const nowIso = new Date().toISOString();
    const isEnterprise = plan === "enterprise";
    const periodEndIso = isEnterprise
      ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const accessCode = buildAccessCode();

    const { error: subError } = await supabase
      .from("realestate_subscriptions")
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

    const paymentCurrency = String(payment.currency || "").toUpperCase();
    if (!["KES", "USD"].includes(paymentCurrency)) {
      throw new Error(`Unexpected Paystack currency: ${paymentCurrency || "unknown"}`);
    }

    const requestedAmountUsd = Number(meta.requested_amount_usd);
    const requestedCurrency = String(meta.requested_currency || "USD").toUpperCase();
    const chargedAmount = Number(meta.charged_amount);
    const chargedAmountKes = Number(meta.charged_amount_kes);
    const paidAmount = Number(payment.amount || 0) / 100;
    const expectedChargedAmount = Number.isFinite(chargedAmount) && chargedAmount > 0
      ? chargedAmount
      : Number.isFinite(chargedAmountKes) && chargedAmountKes > 0
      ? chargedAmountKes
      : paidAmount;
    if (Math.abs(paidAmount - expectedChargedAmount) > 0.02) {
      throw new Error("Verified amount does not match initialized Paystack amount");
    }

    const amountValue = Number.isFinite(requestedAmountUsd) && requestedAmountUsd > 0
      ? requestedAmountUsd
      : paidAmount;
    const currency = requestedCurrency || "USD";

    const txnId = payment.id != null ? String(payment.id) : "";
    const invoiceExternalId = txnId ? `paystack:txn:${txnId}` : `paystack:${reference}`;

    const { error: invoiceError } = await supabase.from("realestate_invoices").insert({
      user_id: userData.user.id,
      amount: amountValue,
      currency,
      description: `Data Pulse Flow Real Estate Suite (${plan})`,
      invoice_date: nowIso,
      due_date: nowIso,
      status: "paid",
      paid_at: nowIso,
      stripe_invoice_id: invoiceExternalId,
    });
    if (invoiceError) {
      throw new Error(`Failed to create invoice: ${invoiceError.message}`);
    }

    const { error: codeError } = await supabase.from("realestate_client_access_codes").insert({
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
        billing: "one_time",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
