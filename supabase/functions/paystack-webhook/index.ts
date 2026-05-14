import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  augmentPaystackPaymentWithSubscriptionCode,
  fulfillPaystackSubscriptionPayment,
  paymentHasPaystackPlan,
  resolveUserIdFromChargePayload,
} from "../_shared/paystack-subscription-fulfillment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const extractSubscriptionCode = (data: Record<string, unknown>): string => {
  const direct = String(data.subscription_code ?? "").trim();
  if (direct) return direct;
  const sub = data.subscription;
  if (sub && typeof sub === "object") {
    return String((sub as Record<string, unknown>).subscription_code ?? "").trim();
  }
  return "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") ?? "";

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["paystack_secret_key"]);
    if (settingsError) throw new Error(`Failed to load Paystack settings: ${settingsError.message}`);
    const paystackSecret = String(
      settings?.find((s) => s.setting_key === "paystack_secret_key")?.setting_value ?? "",
    ).trim();
    if (!paystackSecret) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hash = await hmacSha512Hex(paystackSecret, rawBody);
    if (hash !== signature) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
    const eventName = event.event ?? "";
    const data = event.data ?? {};

    if (eventName === "charge.success") {
      const payment = data as Record<string, unknown>;
      if (!paymentHasPaystackPlan(payment)) {
        return new Response(JSON.stringify({ received: true, ignored: "not_subscription_plan" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resolved = await resolveUserIdFromChargePayload(supabase, payment);
      if (!resolved) {
        return new Response(JSON.stringify({ received: true, ignored: "unresolved_user" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paymentReady = await augmentPaystackPaymentWithSubscriptionCode(payment, paystackSecret);

      const result = await fulfillPaystackSubscriptionPayment({
        supabase,
        payment: paymentReady,
        userId: resolved.userId,
        productLine: resolved.productLine,
      });

      return new Response(
        JSON.stringify({
          received: true,
          processed: !result.alreadyProcessed,
          reference: result.reference,
          userId: resolved.userId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (eventName === "subscription.not_renew") {
      const code = extractSubscriptionCode(data);
      if (code) {
        await supabase.from("subscriptions").update({ paystack_non_renewing: true }).eq(
          "paystack_subscription_code",
          code,
        );
        await supabase.from("realestate_subscriptions").update({ paystack_non_renewing: true }).eq(
          "paystack_subscription_code",
          code,
        );
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventName === "subscription.disable") {
      const code = extractSubscriptionCode(data);
      if (code) {
        const nowIso = new Date().toISOString();
        await supabase.from("subscriptions").update({
          paystack_subscription_code: null,
          paystack_non_renewing: false,
          status: "cancelled",
          updated_at: nowIso,
        }).eq("paystack_subscription_code", code);
        await supabase.from("realestate_subscriptions").update({
          paystack_subscription_code: null,
          paystack_non_renewing: false,
          status: "cancelled",
          updated_at: nowIso,
        }).eq("paystack_subscription_code", code);
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventName === "invoice.payment_failed") {
      const code = extractSubscriptionCode(data);
      if (code) {
        const nowIso = new Date().toISOString();
        await supabase.from("subscriptions").update({ status: "past_due", updated_at: nowIso }).eq(
          "paystack_subscription_code",
          code,
        );
        await supabase.from("realestate_subscriptions").update({ status: "past_due", updated_at: nowIso }).eq(
          "paystack_subscription_code",
          code,
        );
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true, ignored: eventName }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
