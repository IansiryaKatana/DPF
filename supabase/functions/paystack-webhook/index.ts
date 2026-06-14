import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  extractTransactionReferenceFromInvoiceEvent,
  fetchVerifiedPaystackTransaction,
  invoiceUpdateLooksPaid,
  processPaystackSubscriptionCharge,
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

const loadPaystackSecret = async (supabase: ReturnType<typeof createClient>): Promise<string> => {
  const { data: settings, error: settingsError } = await supabase
    .from("admin_settings")
    .select("setting_key, setting_value")
    .in("setting_key", ["paystack_secret_key"]);
  if (settingsError) throw new Error(`Failed to load Paystack settings: ${settingsError.message}`);
  const paystackSecret = String(
    settings?.find((s) => s.setting_key === "paystack_secret_key")?.setting_value ?? "",
  ).trim();
  if (!paystackSecret) throw new Error("Paystack not configured");
  return paystackSecret;
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
    const paystackSecret = await loadPaystackSecret(supabase);

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
      const result = await processPaystackSubscriptionCharge({
        supabase,
        payment: data as Record<string, unknown>,
        paystackSecret,
      });

      if (result.status === "ignored") {
        return new Response(JSON.stringify({ received: true, ignored: result.reason }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (result.status === "error") {
        throw new Error(result.message);
      }

      return new Response(
        JSON.stringify({
          received: true,
          processed: !result.alreadyProcessed,
          reference: result.reference,
          userId: result.userId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (eventName === "invoice.update") {
      if (!invoiceUpdateLooksPaid(data)) {
        return new Response(JSON.stringify({ received: true, ignored: "invoice_not_paid" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const reference = extractTransactionReferenceFromInvoiceEvent(data);
      if (!reference) {
        return new Response(JSON.stringify({ received: true, ignored: "no_transaction_reference" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payment = await fetchVerifiedPaystackTransaction(reference, paystackSecret);
      const sub = data.subscription;
      if (sub && typeof sub === "object" && !payment.subscription) {
        payment.subscription = sub;
      }

      const result = await processPaystackSubscriptionCharge({
        supabase,
        payment,
        paystackSecret,
      });

      if (result.status === "ignored") {
        return new Response(JSON.stringify({ received: true, ignored: result.reason, source: "invoice.update" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (result.status === "error") {
        throw new Error(result.message);
      }

      return new Response(
        JSON.stringify({
          received: true,
          source: "invoice.update",
          processed: !result.alreadyProcessed,
          reference: result.reference,
          userId: result.userId,
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
