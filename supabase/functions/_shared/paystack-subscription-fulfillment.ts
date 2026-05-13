import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export type PaystackProductLine = "shopify" | "realestate";

const DAY_MS = 24 * 60 * 60 * 1000;

export const buildAccessCode = () => {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (size: number) =>
    Array.from({ length: size }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
  return `DPF-${chunk(4)}-${chunk(4)}-${chunk(4)}`;
};

export const billingPeriodAddMs = (productLine: PaystackProductLine, planKey: string): number => {
  if (productLine === "shopify") return 30 * DAY_MS;
  if (planKey === "growth") return 30 * DAY_MS;
  if (planKey === "pro") return 365 * DAY_MS;
  return 30 * DAY_MS;
};

const invoiceKeys = (payment: Record<string, unknown>): string[] => {
  const reference = String(payment.reference ?? "");
  const txnId = payment.id != null ? String(payment.id) : "";
  const keys: string[] = [];
  if (txnId) keys.push(`paystack:txn:${txnId}`);
  if (reference) keys.push(`paystack:${reference}`);
  return keys;
};

export const invoiceAlreadyRecorded = async (
  supabase: SupabaseClient,
  invoiceTable: "invoices" | "realestate_invoices",
  keys: string[],
): Promise<boolean> => {
  if (keys.length === 0) return false;
  const { data, error } = await supabase.from(invoiceTable).select("id").in("stripe_invoice_id", keys).limit(1);
  if (error) throw new Error(`Invoice lookup failed: ${error.message}`);
  return Boolean(data?.length);
};

type FulfillResult = {
  alreadyProcessed: boolean;
  reference?: string;
  plan?: string;
  accessCode?: string;
  accessCodeExpiresAt?: string;
};

/**
 * Fulfill a successful Paystack transaction that used a Plan (subscription).
 * Idempotent via paystack:txn:{id} / paystack:{reference} on the invoice table.
 */
export const fulfillPaystackSubscriptionPayment = async (params: {
  supabase: SupabaseClient;
  payment: Record<string, unknown>;
  userId: string;
  productLine: PaystackProductLine;
}): Promise<FulfillResult> => {
  const { supabase, payment, userId, productLine } = params;
  const keys = invoiceKeys(payment);
  const invoiceTable = productLine === "shopify" ? "invoices" : "realestate_invoices";
  const subTable = productLine === "shopify" ? "subscriptions" : "realestate_subscriptions";
  const codesTable = productLine === "shopify" ? "client_access_codes" : "realestate_client_access_codes";

  if (await invoiceAlreadyRecorded(supabase, invoiceTable, keys)) {
    return { alreadyProcessed: true, reference: String(payment.reference ?? "") };
  }

  const metadata =
    payment.metadata && typeof payment.metadata === "object" ? (payment.metadata as Record<string, unknown>) : {};
  const subscriptionObj =
    payment.subscription && typeof payment.subscription === "object"
      ? (payment.subscription as Record<string, unknown>)
      : null;
  const subscriptionCode = String(subscriptionObj?.subscription_code ?? "").trim();
  if (!subscriptionCode) {
    throw new Error("Paystack subscription_code missing on verified payment");
  }

  let planKey = String(metadata.planKey ?? "").trim();
  if (!planKey) {
    const { data: subPlan } = await supabase
      .from(subTable)
      .select("plan")
      .eq("paystack_subscription_code", subscriptionCode)
      .maybeSingle();
    if (subPlan?.plan) planKey = String(subPlan.plan);
  }
  if (!planKey) {
    const { data: codePlan } = await supabase
      .from(codesTable)
      .select("plan")
      .eq("paystack_subscription_code", subscriptionCode)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (codePlan?.plan) planKey = String(codePlan.plan);
  }
  if (!planKey) planKey = "growth";

  const customerObj =
    payment.customer && typeof payment.customer === "object" ? (payment.customer as Record<string, unknown>) : null;
  const customerCode = String(customerObj?.customer_code ?? "").trim() || null;

  const nowIso = new Date().toISOString();
  const addMs = billingPeriodAddMs(productLine, planKey);
  const nowMs = Date.now();

  const { data: existingCodeRows, error: codeLookupError } = await supabase
    .from(codesTable)
    .select("id, code, expires_at")
    .eq("user_id", userId)
    .eq("paystack_subscription_code", subscriptionCode)
    .order("issued_at", { ascending: false })
    .limit(1);

  if (codeLookupError) throw new Error(`Access code lookup failed: ${codeLookupError.message}`);
  const existingCode = existingCodeRows?.[0] ?? null;

  let accessCode: string;
  let periodEndIso: string;

  if (existingCode) {
    accessCode = existingCode.code as string;
    const baseMs = Math.max(nowMs, new Date(String(existingCode.expires_at)).getTime());
    periodEndIso = new Date(baseMs + addMs).toISOString();
    const { error: updCodeErr } = await supabase
      .from(codesTable)
      .update({ expires_at: periodEndIso, status: "active" })
      .eq("id", existingCode.id as string);
    if (updCodeErr) throw new Error(`Failed to extend access code: ${updCodeErr.message}`);
  } else {
    accessCode = buildAccessCode();
    const baseMs = nowMs;
    periodEndIso = new Date(baseMs + addMs).toISOString();
    const { error: insCodeErr } = await supabase.from(codesTable).insert({
      user_id: userId,
      code: accessCode,
      plan: planKey,
      status: "active",
      issued_at: nowIso,
      expires_at: periodEndIso,
      paystack_subscription_code: subscriptionCode,
    });
    if (insCodeErr) throw new Error(`Failed to issue access code: ${insCodeErr.message}`);
  }

  const { error: subError } = await supabase
    .from(subTable)
    .update({
      plan: planKey,
      status: "active",
      current_period_start: nowIso,
      current_period_end: periodEndIso,
      trial_start: nowIso,
      trial_end: periodEndIso,
      paystack_subscription_code: subscriptionCode,
      paystack_customer_code: customerCode,
      paystack_non_renewing: false,
      updated_at: nowIso,
    })
    .eq("user_id", userId);
  if (subError) throw new Error(`Failed to update subscription: ${subError.message}`);

  const paymentCurrency = String(payment.currency || "").toUpperCase();
  if (!["KES", "USD"].includes(paymentCurrency)) {
    throw new Error(`Unexpected Paystack currency: ${paymentCurrency || "unknown"}`);
  }

  const paidAmount = Number(payment.amount || 0) / 100;
  const requestedAmountUsd = Number(metadata.requested_amount_usd);
  const requestedCurrency = String(metadata.requested_currency || "USD").toUpperCase();
  const chargedAmount = Number(metadata.charged_amount);
  const chargedAmountKes = Number(metadata.charged_amount_kes);
  const hasCheckoutMetadata = Boolean(metadata.userId) &&
    (Number.isFinite(chargedAmount) && chargedAmount > 0 ||
      Number.isFinite(chargedAmountKes) && chargedAmountKes > 0);

  let amountValue: number;
  let currency: string;

  if (hasCheckoutMetadata) {
    const expectedChargedAmount = Number.isFinite(chargedAmount) && chargedAmount > 0
      ? chargedAmount
      : Number.isFinite(chargedAmountKes) && chargedAmountKes > 0
      ? chargedAmountKes
      : paidAmount;
    if (Math.abs(paidAmount - expectedChargedAmount) > 0.02) {
      throw new Error("Verified amount does not match initialized Paystack amount");
    }
    amountValue = Number.isFinite(requestedAmountUsd) && requestedAmountUsd > 0 ? requestedAmountUsd : paidAmount;
    currency = requestedCurrency || "USD";
  } else {
    // Renewals often omit custom metadata — trust Paystack-settled amount.
    amountValue = paidAmount;
    currency = paymentCurrency || "USD";
  }

  const txnId = payment.id != null ? String(payment.id) : "";
  const reference = String(payment.reference ?? "");
  const invoiceExternalId = txnId ? `paystack:txn:${txnId}` : `paystack:${reference}`;

  const suiteLabel = productLine === "shopify" ? "Shopify Suite" : "Real Estate Suite";
  const renewalNote = existingCode ? " (renewal)" : " (subscription start)";
  const { error: invoiceError } = await supabase.from(invoiceTable).insert({
    user_id: userId,
    amount: amountValue,
    currency,
    description: `Data Pulse Flow ${suiteLabel} (${planKey})${renewalNote}`,
    invoice_date: nowIso,
    due_date: nowIso,
    status: "paid",
    paid_at: nowIso,
    stripe_invoice_id: invoiceExternalId,
  });
  if (invoiceError) throw new Error(`Failed to create invoice: ${invoiceError.message}`);

  return {
    alreadyProcessed: false,
    reference,
    plan: planKey,
    accessCode,
    accessCodeExpiresAt: periodEndIso,
  };
};

export const paymentHasPaystackPlan = (payment: Record<string, unknown>): boolean => {
  const plan = payment.plan;
  if (plan && typeof plan === "object" && (plan as Record<string, unknown>).plan_code) return true;
  const sub = payment.subscription;
  if (sub && typeof sub === "object" && (sub as Record<string, unknown>).subscription_code) return true;
  const meta =
    payment.metadata && typeof payment.metadata === "object"
      ? (payment.metadata as Record<string, unknown>)
      : {};
  if (String(meta.billing) === "subscription") return true;
  return false;
};

export const resolveUserIdFromChargePayload = async (
  supabase: SupabaseClient,
  data: Record<string, unknown>,
): Promise<{ userId: string; productLine: PaystackProductLine; planKey: string } | null> => {
  const metadata =
    data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};
  const metaUser = String(metadata.userId ?? "").trim();
  const metaProduct = String(metadata.productLine ?? "").toLowerCase();
  const planKeyMeta = String(metadata.planKey ?? "growth");

  if (metaUser && (metaProduct === "shopify" || metaProduct === "realestate")) {
    return { userId: metaUser, productLine: metaProduct as PaystackProductLine, planKey: planKeyMeta };
  }

  const subscriptionObj =
    data.subscription && typeof data.subscription === "object"
      ? (data.subscription as Record<string, unknown>)
      : null;
  const subscriptionCode = String(subscriptionObj?.subscription_code ?? "").trim();
  if (subscriptionCode) {
    const { data: shopRow } = await supabase
      .from("subscriptions")
      .select("user_id, plan")
      .eq("paystack_subscription_code", subscriptionCode)
      .maybeSingle();
    if (shopRow?.user_id) {
      return { userId: shopRow.user_id as string, productLine: "shopify", planKey: String(shopRow.plan ?? planKeyMeta) };
    }
    const { data: reRow } = await supabase
      .from("realestate_subscriptions")
      .select("user_id, plan")
      .eq("paystack_subscription_code", subscriptionCode)
      .maybeSingle();
    if (reRow?.user_id) {
      return {
        userId: reRow.user_id as string,
        productLine: "realestate",
        planKey: String(reRow.plan ?? planKeyMeta),
      };
    }

    const { data: shopCode } = await supabase
      .from("client_access_codes")
      .select("user_id, plan")
      .eq("paystack_subscription_code", subscriptionCode)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shopCode?.user_id) {
      return {
        userId: shopCode.user_id as string,
        productLine: "shopify",
        planKey: String(shopCode.plan ?? planKeyMeta),
      };
    }

    const { data: reCode } = await supabase
      .from("realestate_client_access_codes")
      .select("user_id, plan")
      .eq("paystack_subscription_code", subscriptionCode)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reCode?.user_id) {
      return {
        userId: reCode.user_id as string,
        productLine: "realestate",
        planKey: String(reCode.plan ?? planKeyMeta),
      };
    }
  }

  const customerObj =
    data.customer && typeof data.customer === "object" ? (data.customer as Record<string, unknown>) : null;
  const customerCode = String(customerObj?.customer_code ?? "").trim();
  if (customerCode) {
    const { data: s } = await supabase
      .from("subscriptions")
      .select("user_id, plan, paystack_subscription_code")
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();
    if (s?.user_id && s.paystack_subscription_code) {
      return { userId: s.user_id as string, productLine: "shopify", planKey: String(s.plan ?? planKeyMeta) };
    }
    const { data: r } = await supabase
      .from("realestate_subscriptions")
      .select("user_id, plan, paystack_subscription_code")
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();
    if (r?.user_id && r.paystack_subscription_code) {
      return { userId: r.user_id as string, productLine: "realestate", planKey: String(r.plan ?? planKeyMeta) };
    }
  }

  return null;
};
