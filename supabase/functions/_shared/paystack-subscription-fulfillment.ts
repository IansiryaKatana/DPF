import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export type PaystackProductLine = "shopify" | "realestate";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Our subscription initialize endpoints embed user + plan in the Paystack reference:
 * - Shopify: `DPF_SUB_{uuid}_{planKey}_{timestamp}`
 * - Real estate: `DPF_RESUB_{uuid}_{planKey}_{timestamp}`
 * Webhooks often omit `plan` / `subscription` / metadata fields; this is the reliable fallback.
 */
export const parseDpfSubscriptionCheckoutReference = (
  reference: string,
): { userId: string; planKey: string; productLine: PaystackProductLine } | null => {
  const ref = String(reference ?? "").trim();
  let productLine: PaystackProductLine = "shopify";
  let prefix = "";
  if (ref.startsWith("DPF_RESUB_")) {
    prefix = "DPF_RESUB_";
    productLine = "realestate";
  } else if (ref.startsWith("DPF_SUB_")) {
    prefix = "DPF_SUB_";
    productLine = "shopify";
  } else {
    return null;
  }
  const rest = ref.slice(prefix.length);
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore <= 0) return null;
  const tail = rest.slice(lastUnderscore + 1);
  if (!/^\d+$/.test(tail)) return null;
  const beforeTime = rest.slice(0, lastUnderscore);
  const planSep = beforeTime.lastIndexOf("_");
  if (planSep <= 0) return null;
  const userId = beforeTime.slice(0, planSep);
  const planKey = beforeTime.slice(planSep + 1);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !planKey) return null;
  return { userId, planKey, productLine };
};

/** Paystack sometimes returns `metadata` as a JSON string; normalize to an object. */
export const parsePaystackMetadata = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
};

/**
 * Webhook `charge.success` payloads are often thinner than `transaction/verify`.
 * Merge missing customer / subscription / plan from verify so subscription list + codes resolve.
 */
const mergePaystackVerifyIntoPayment = async (
  payment: Record<string, unknown>,
  paystackSecret: string,
): Promise<Record<string, unknown>> => {
  const ref = String(payment.reference ?? "").trim();
  if (!ref || !paystackSecret) return payment;

  const vr = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      "Content-Type": "application/json",
    },
  });
  const vj = await vr.json();
  if (!vr.ok || !vj?.status || !vj?.data || typeof vj.data !== "object") return payment;

  const d = vj.data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...payment };

  const curCust =
    payment.customer && typeof payment.customer === "object"
      ? (payment.customer as Record<string, unknown>)
      : null;
  if (!String(curCust?.customer_code ?? "").trim() && d.customer && typeof d.customer === "object") {
    out.customer = d.customer;
  }

  const curSub =
    payment.subscription && typeof payment.subscription === "object"
      ? (payment.subscription as Record<string, unknown>)
      : null;
  if (!String(curSub?.subscription_code ?? "").trim() && d.subscription && typeof d.subscription === "object") {
    out.subscription = d.subscription;
  }

  if (payment.plan == null && d.plan != null) {
    out.plan = d.plan;
  }

  return out;
};

/**
 * Verify responses often omit `subscription.subscription_code` even when the charge succeeded.
 * Resolve it via Paystack's subscription list (same customer + plan when available).
 */
export const augmentPaystackPaymentWithSubscriptionCode = async (
  payment: Record<string, unknown>,
  paystackSecret: string,
): Promise<Record<string, unknown>> => {
  const existingSub =
    payment.subscription && typeof payment.subscription === "object"
      ? (payment.subscription as Record<string, unknown>)
      : null;
  if (String(existingSub?.subscription_code ?? "").trim()) return payment;

  let paymentWork = await mergePaystackVerifyIntoPayment(payment, paystackSecret);

  const subAfterMerge =
    paymentWork.subscription && typeof paymentWork.subscription === "object"
      ? (paymentWork.subscription as Record<string, unknown>)
      : null;
  if (String(subAfterMerge?.subscription_code ?? "").trim()) return paymentWork;

  const customerObj =
    paymentWork.customer && typeof paymentWork.customer === "object"
      ? (paymentWork.customer as Record<string, unknown>)
      : null;
  const customerCode = String(customerObj?.customer_code ?? "").trim();
  if (!customerCode) return paymentWork;

  const planField = paymentWork.plan;
  let planFilter = "";
  if (typeof planField === "string") planFilter = planField.trim();
  else if (planField && typeof planField === "object") {
    planFilter = String((planField as Record<string, unknown>).plan_code ?? "").trim();
  }

  const url = new URL("https://api.paystack.co/subscription");
  url.searchParams.set("customer", customerCode);
  url.searchParams.set("perPage", "50");
  if (planFilter) url.searchParams.set("plan", planFilter);

  const tryList = async (): Promise<string> => {
    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
    });
    const listJson = await listRes.json();
    if (!listRes.ok || !listJson?.status || !Array.isArray(listJson?.data)) return "";

    const rows = listJson.data as Record<string, unknown>[];
    const normalizeStatus = (s: unknown) => String(s ?? "").toLowerCase();
    const activeRows = rows.filter((r) => ["active", "non-renewing"].includes(normalizeStatus(r.status)));
    const candidates = activeRows.length > 0 ? activeRows : rows;

    const planRow = planFilter
      ? candidates.find((r) => {
          const p = r.plan;
          const code =
            typeof p === "string"
              ? p
              : p && typeof p === "object"
              ? String((p as Record<string, unknown>).plan_code ?? "")
              : "";
          return code === planFilter;
        })
      : undefined;

    const chosen = planRow ?? candidates[0];
    return chosen ? String(chosen.subscription_code ?? "").trim() : "";
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const subCode = await tryList();
    if (subCode) {
      return {
        ...paymentWork,
        subscription: {
          ...(typeof paymentWork.subscription === "object" && paymentWork.subscription
            ? (paymentWork.subscription as Record<string, unknown>)
            : {}),
          subscription_code: subCode,
        },
      };
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 450));
  }

  return paymentWork;
};

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

  const metadata = parsePaystackMetadata(payment.metadata);
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
  const ref = String(payment.reference ?? "").trim();
  if (ref.startsWith("DPF_SUB_") || ref.startsWith("DPF_RESUB_")) return true;
  const plan = payment.plan;
  if (typeof plan === "string" && plan.trim().length > 0) return true;
  if (plan && typeof plan === "object" && (plan as Record<string, unknown>).plan_code) return true;
  const sub = payment.subscription;
  if (sub && typeof sub === "object" && (sub as Record<string, unknown>).subscription_code) return true;
  const meta = parsePaystackMetadata(payment.metadata);
  if (String(meta.billing) === "subscription") return true;
  return false;
};

export const resolveUserIdFromChargePayload = async (
  supabase: SupabaseClient,
  data: Record<string, unknown>,
): Promise<{ userId: string; productLine: PaystackProductLine; planKey: string } | null> => {
  const fromRef = parseDpfSubscriptionCheckoutReference(String(data.reference ?? ""));
  if (fromRef) {
    return { userId: fromRef.userId, productLine: fromRef.productLine, planKey: fromRef.planKey };
  }

  const metadata = parsePaystackMetadata(data.metadata);
  const metaUser = String(metadata.userId ?? "").trim();
  const metaProduct = String(metadata.productLine ?? "").toLowerCase();
  const planKeyMeta = String(metadata.planKey ?? "growth");

  if (metaUser && (metaProduct === "shopify" || metaProduct === "realestate")) {
    return { userId: metaUser, productLine: metaProduct as PaystackProductLine, planKey: planKeyMeta };
  }

  if (metaUser && String(metadata.billing) === "subscription") {
    const inferred: PaystackProductLine = metaProduct === "realestate" ? "realestate" : "shopify";
    return { userId: metaUser, productLine: inferred, planKey: planKeyMeta || "growth" };
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
