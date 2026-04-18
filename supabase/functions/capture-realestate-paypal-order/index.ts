import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FailurePayload = {
  error: string;
  code?: string;
  order_id?: string;
  paypal_status?: number;
  paypal_issue?: string;
  paypal_debug_id?: string;
  paypal_details?: unknown;
};

class HttpError extends Error {
  status: number;
  payload: FailurePayload;

  constructor(status: number, payload: FailurePayload) {
    super(payload.error);
    this.status = status;
    this.payload = payload;
  }
}

const parseJsonSafe = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const extractPayPalIssue = (payload: Record<string, unknown>) => {
  const details = Array.isArray(payload.details) ? payload.details : [];
  const firstDetail = details[0] as Record<string, unknown> | undefined;
  const issue = typeof firstDetail?.issue === "string" ? firstDetail.issue : undefined;
  return issue;
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
    const authJson = await parseJsonSafe(authRes);
    if (!authRes.ok || !authJson.access_token) {
      throw new HttpError(502, {
        error: "Failed to authenticate with PayPal",
        code: "PAYPAL_AUTH_FAILED",
        paypal_status: authRes.status,
        paypal_issue: typeof authJson.error === "string" ? authJson.error : undefined,
        paypal_details: authJson,
      });
    }

    const orderRes = await fetch(`${paypalBase}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authJson.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const orderJson = await parseJsonSafe(orderRes);
    if (!orderRes.ok) {
      throw new HttpError(502, {
        error: "Failed to load PayPal order",
        code: "PAYPAL_ORDER_LOOKUP_FAILED",
        order_id: orderId,
        paypal_status: orderRes.status,
        paypal_issue: extractPayPalIssue(orderJson),
        paypal_debug_id:
          typeof orderJson.debug_id === "string" ? orderJson.debug_id : undefined,
        paypal_details: orderJson,
      });
    }

    const customId: string | undefined = (orderJson.purchase_units as Array<Record<string, unknown>> | undefined)?.[0]?.custom_id as string | undefined;
    const referenceId: string | undefined = (orderJson.purchase_units as Array<Record<string, unknown>> | undefined)?.[0]?.reference_id as string | undefined;
    const [, planKeyFromCustom] = (customId || "").split(":");
    const plan = referenceId || planKeyFromCustom || "growth";

    let captureJson = orderJson;
    const orderStatus = typeof orderJson.status === "string" ? orderJson.status : "";

    if (orderStatus === "COMPLETED") {
      // Order already captured in a prior attempt; continue idempotently.
      console.info("PayPal order already completed, skipping re-capture", { orderId });
    } else {
      if (orderStatus !== "APPROVED") {
        throw new HttpError(409, {
          error: "PayPal order is not in APPROVED state for capture",
          code: "PAYPAL_ORDER_NOT_APPROVED",
          order_id: orderId,
          paypal_issue: orderStatus || "UNKNOWN_ORDER_STATUS",
          paypal_details: orderJson,
        });
      }

      const captureRes = await fetch(`${paypalBase}/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authJson.access_token as string}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": orderId,
        },
      });
      captureJson = await parseJsonSafe(captureRes);

      if (!captureRes.ok) {
        throw new HttpError(502, {
          error: "Failed to capture PayPal payment",
          code: "PAYPAL_CAPTURE_FAILED",
          order_id: orderId,
          paypal_status: captureRes.status,
          paypal_issue: extractPayPalIssue(captureJson),
          paypal_debug_id:
            typeof captureJson.debug_id === "string" ? captureJson.debug_id : undefined,
          paypal_details: captureJson,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const isEnterprise = plan === "enterprise";
    const periodEndIso = isEnterprise
      ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const accessCode = buildAccessCode();
    const captureId =
      (captureJson.purchase_units as Array<Record<string, unknown>> | undefined)?.[0]?.payments &&
      typeof ((captureJson.purchase_units as Array<Record<string, unknown>> | undefined)?.[0]?.payments as Record<string, unknown>) === "object"
        ? ((((captureJson.purchase_units as Array<Record<string, unknown>> | undefined)?.[0]?.payments as Record<string, unknown>).captures as Array<Record<string, unknown>> | undefined)?.[0]?.id as string | undefined) ?? orderId
        : orderId;

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

    const amountValue = Number(
      ((((captureJson.purchase_units as Array<Record<string, unknown>> | undefined)?.[0]?.payments as Record<string, unknown> | undefined)?.captures as Array<Record<string, unknown>> | undefined)?.[0]?.amount as Record<string, unknown> | undefined)?.value ?? "0"
    );
    const currency =
      ((((captureJson.purchase_units as Array<Record<string, unknown>> | undefined)?.[0]?.payments as Record<string, unknown> | undefined)?.captures as Array<Record<string, unknown>> | undefined)?.[0]?.amount as Record<string, unknown> | undefined)?.currency_code as string | undefined ?? "USD";
    const invoiceRef = `paypal:${captureId}`;

    const { data: existingInvoice, error: existingInvoiceError } = await supabase
      .from("realestate_invoices")
      .select("id")
      .eq("stripe_invoice_id", invoiceRef)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (existingInvoiceError) {
      throw new Error(`Failed to verify existing invoice: ${existingInvoiceError.message}`);
    }

    if (!existingInvoice) {
      const { error: invoiceError } = await supabase.from("realestate_invoices").insert({
        user_id: userData.user.id,
        amount: amountValue,
        currency,
        description: `Data Pulse Flow Real Estate Suite (${plan})`,
        invoice_date: nowIso,
        due_date: nowIso,
        status: "paid",
        paid_at: nowIso,
        stripe_invoice_id: invoiceRef,
      });
      if (invoiceError) {
        throw new Error(`Failed to create invoice: ${invoiceError.message}`);
      }
    }

    const { data: existingCode, error: existingCodeError } = await supabase
      .from("realestate_client_access_codes")
      .select("code, expires_at")
      .eq("user_id", userData.user.id)
      .eq("plan", plan)
      .eq("status", "active")
      .gte("expires_at", nowIso)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingCodeError) {
      throw new Error(`Failed to verify existing access code: ${existingCodeError.message}`);
    }

    let finalAccessCode = accessCode;
    if (existingCode?.code) {
      finalAccessCode = existingCode.code;
    } else {
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
    }

    return new Response(
      JSON.stringify({
        status: captureJson.status,
        orderId: captureJson.id,
        captureId,
        plan,
        lifetime: isEnterprise,
        accessCode: finalAccessCode,
        accessCodeExpiresAt: periodEndIso,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return new Response(JSON.stringify(error.payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.status,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
