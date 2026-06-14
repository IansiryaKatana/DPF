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

const normalizeEmail = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const paystackApiGet = async (url: string, paystackSecret: string) => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
  });
  const json = await res.json();
  return { res, json };
};

const attachSubscriptionCodeToPayment = (
  payment: Record<string, unknown>,
  subscriptionCode: string,
): Record<string, unknown> => ({
  ...payment,
  subscription_code: subscriptionCode,
  subscription: {
    ...(payment.subscription && typeof payment.subscription === "object"
      ? (payment.subscription as Record<string, unknown>)
      : {}),
    subscription_code: subscriptionCode,
  },
});

const extractSubscriptionCodeFromPayment = (payment: Record<string, unknown>): string => {
  const direct = String(payment.subscription_code ?? "").trim();
  if (direct) return direct;
  const sub = payment.subscription;
  if (sub && typeof sub === "object") {
    return String((sub as Record<string, unknown>).subscription_code ?? "").trim();
  }
  return "";
};

const pickSubscriptionCodeFromRows = (
  rows: Record<string, unknown>[],
  planCodeFilter: string,
): string => {
  const normalizeStatus = (s: unknown) => String(s ?? "").toLowerCase();
  const activeRows = rows.filter((r) => ["active", "non-renewing"].includes(normalizeStatus(r.status)));
  const candidates = activeRows.length > 0 ? activeRows : rows;

  const planRow = planCodeFilter
    ? candidates.find((r) => {
        const p = r.plan;
        const code =
          typeof p === "string"
            ? p
            : p && typeof p === "object"
            ? String((p as Record<string, unknown>).plan_code ?? "")
            : "";
        return code === planCodeFilter;
      })
    : undefined;

  const chosen = planRow ?? candidates[0];
  return chosen ? String(chosen.subscription_code ?? "").trim() : "";
};

const resolvePaystackPlanFilter = (payment: Record<string, unknown>): string => {
  const planField = payment.plan;
  if (typeof planField === "string") return planField.trim();
  if (planField && typeof planField === "object") {
    return String((planField as Record<string, unknown>).plan_code ?? "").trim();
  }
  const planObject =
    payment.plan_object && typeof payment.plan_object === "object"
      ? (payment.plan_object as Record<string, unknown>)
      : null;
  return String(planObject?.plan_code ?? "").trim();
};

const resolvePaystackCustomerKeys = async (
  payment: Record<string, unknown>,
  paystackSecret: string,
): Promise<{ customerKeys: string[]; payment: Record<string, unknown> }> => {
  let paymentWork = payment;
  const customerObj =
    paymentWork.customer && typeof paymentWork.customer === "object"
      ? (paymentWork.customer as Record<string, unknown>)
      : null;

  let customerCode = String(customerObj?.customer_code ?? "").trim();
  let customerId = customerObj?.id != null ? String(customerObj.id).trim() : "";

  if (!customerCode || !customerId) {
    const customerEmail = normalizeEmail(customerObj?.email);
    if (customerEmail) {
      const { res, json } = await paystackApiGet(
        `https://api.paystack.co/customer/${encodeURIComponent(customerEmail)}`,
        paystackSecret,
      );
      if (res.ok && json?.status && json?.data && typeof json.data === "object") {
        const custData = json.data as Record<string, unknown>;
        customerCode = customerCode || String(custData.customer_code ?? "").trim();
        customerId = customerId || (custData.id != null ? String(custData.id).trim() : "");
        paymentWork = {
          ...paymentWork,
          customer: {
            ...(customerObj ?? {}),
            ...custData,
            ...(customerCode ? { customer_code: customerCode } : {}),
          },
        };
      }
    }
  }

  const customerKeys = [...new Set([customerId, customerCode].filter(Boolean))];
  return { customerKeys, payment: paymentWork };
};

const listPaystackSubscriptionCode = async (
  paystackSecret: string,
  customerKeys: string[],
  planCodeFilter: string,
): Promise<string> => {
  for (const customerKey of customerKeys) {
    for (const planFilter of planCodeFilter ? [planCodeFilter, ""] : [""]) {
      const url = new URL("https://api.paystack.co/subscription");
      url.searchParams.set("customer", customerKey);
      url.searchParams.set("perPage", "50");
      if (planFilter) url.searchParams.set("plan", planFilter);

      const { res, json } = await paystackApiGet(url.toString(), paystackSecret);
      if (!res.ok || !json?.status || !Array.isArray(json?.data)) continue;

      const code = pickSubscriptionCodeFromRows(json.data as Record<string, unknown>[], planFilter);
      if (code) return code;
    }
  }
  return "";
};

const resolveSubscriptionCodeFromPaystackInvoices = async (
  paystackSecret: string,
  customerKeys: string[],
  paymentReference: string,
): Promise<string> => {
  for (const customerKey of customerKeys) {
    const url = new URL("https://api.paystack.co/invoice");
    url.searchParams.set("customer", customerKey);
    url.searchParams.set("perPage", "50");

    const { res, json } = await paystackApiGet(url.toString(), paystackSecret);
    if (!res.ok || !json?.status || !Array.isArray(json?.data)) continue;

    for (const inv of json.data as Record<string, unknown>[]) {
      const txn = inv.transaction;
      const txnRef = txn && typeof txn === "object"
        ? String((txn as Record<string, unknown>).reference ?? "").trim()
        : "";
      if (paymentReference && txnRef && txnRef !== paymentReference) continue;

      const direct = String(inv.subscription_code ?? "").trim();
      if (direct) return direct;

      const sub = inv.subscription;
      if (sub && typeof sub === "object") {
        const code = String((sub as Record<string, unknown>).subscription_code ?? "").trim();
        if (code) return code;
      }
    }
  }
  return "";
};

/** Last-resort Paystack lookups when verify/augment omit subscription_code (common on renewals). */
export const resolvePaystackSubscriptionCode = async (
  payment: Record<string, unknown>,
  paystackSecret: string,
): Promise<{ payment: Record<string, unknown>; subscriptionCode: string }> => {
  let paymentWork = payment;
  let subscriptionCode = extractSubscriptionCodeFromPayment(paymentWork);
  if (subscriptionCode) {
    return { payment: paymentWork, subscriptionCode };
  }

  const txnId = paymentWork.id != null ? String(paymentWork.id).trim() : "";
  if (txnId) {
    const { res, json } = await paystackApiGet(
      `https://api.paystack.co/transaction/${encodeURIComponent(txnId)}`,
      paystackSecret,
    );
    if (res.ok && json?.status && json?.data && typeof json.data === "object") {
      const txn = json.data as Record<string, unknown>;
      subscriptionCode = extractSubscriptionCodeFromPayment(txn);
      if (subscriptionCode) {
        return { payment: attachSubscriptionCodeToPayment(paymentWork, subscriptionCode), subscriptionCode };
      }
      if (txn.customer && typeof txn.customer === "object") {
        paymentWork = {
          ...paymentWork,
          customer: {
            ...(paymentWork.customer && typeof paymentWork.customer === "object"
              ? (paymentWork.customer as Record<string, unknown>)
              : {}),
            ...(txn.customer as Record<string, unknown>),
          },
        };
      }
    }
  }

  const { customerKeys, payment: paymentWithCustomer } = await resolvePaystackCustomerKeys(
    paymentWork,
    paystackSecret,
  );
  paymentWork = paymentWithCustomer;

  const planFilter = resolvePaystackPlanFilter(paymentWork);
  if (customerKeys.length > 0) {
    subscriptionCode = await listPaystackSubscriptionCode(paystackSecret, customerKeys, planFilter);
    if (!subscriptionCode) {
      subscriptionCode = await resolveSubscriptionCodeFromPaystackInvoices(
        paystackSecret,
        customerKeys,
        String(paymentWork.reference ?? ""),
      );
    }
  }

  if (subscriptionCode) {
    return {
      payment: attachSubscriptionCodeToPayment(paymentWork, subscriptionCode),
      subscriptionCode,
    };
  }

  return { payment: paymentWork, subscriptionCode: "" };
};

const loadStoredPaystackSubscriptionCode = async (
  supabase: SupabaseClient,
  userId: string,
  productLine: PaystackProductLine,
): Promise<string> => {
  const subTable = productLine === "shopify" ? "subscriptions" : "realestate_subscriptions";
  const codesTable = productLine === "shopify" ? "client_access_codes" : "realestate_client_access_codes";

  const { data: subRow } = await supabase
    .from(subTable)
    .select("paystack_subscription_code")
    .eq("user_id", userId)
    .maybeSingle();
  const fromSub = String(subRow?.paystack_subscription_code ?? "").trim();
  if (fromSub) return fromSub;

  const { data: codeRow } = await supabase
    .from(codesTable)
    .select("paystack_subscription_code")
    .eq("user_id", userId)
    .not("paystack_subscription_code", "is", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return String(codeRow?.paystack_subscription_code ?? "").trim();
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
  if (d.customer && typeof d.customer === "object") {
    out.customer = {
      ...(curCust ?? {}),
      ...(d.customer as Record<string, unknown>),
    };
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

  if (payment.plan_object == null && d.plan_object != null) {
    out.plan_object = d.plan_object;
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
  if (extractSubscriptionCodeFromPayment(payment)) return payment;

  let paymentWork = await mergePaystackVerifyIntoPayment(payment, paystackSecret);
  if (extractSubscriptionCodeFromPayment(paymentWork)) return paymentWork;

  const planFilter = resolvePaystackPlanFilter(paymentWork);
  const { customerKeys, payment: paymentWithCustomer } = await resolvePaystackCustomerKeys(
    paymentWork,
    paystackSecret,
  );
  paymentWork = paymentWithCustomer;
  if (customerKeys.length === 0) return paymentWork;

  for (let attempt = 0; attempt < 3; attempt++) {
    const subCode = await listPaystackSubscriptionCode(paystackSecret, customerKeys, planFilter);
    if (subCode) return attachSubscriptionCodeToPayment(paymentWork, subCode);
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

export const inferPlanKeyFromPayment = (payment: Record<string, unknown>, fallback = "growth"): string => {
  const metadata = parsePaystackMetadata(payment.metadata);
  const metaPlan = String(metadata.planKey ?? "").trim();
  if (metaPlan) return metaPlan;

  const planObject =
    payment.plan_object && typeof payment.plan_object === "object"
      ? (payment.plan_object as Record<string, unknown>)
      : null;
  const planName = String(planObject?.name ?? "").toLowerCase();
  if (planName.includes("enterprise")) return "enterprise";
  if (planName.includes("pro")) return "pro";
  if (planName.includes("growth")) return "growth";

  const amountUsd = Number(payment.amount || 0) / 100;
  if (amountUsd >= 10000) return "enterprise";
  if (amountUsd >= 650) return "pro";
  if (amountUsd >= 400) return "growth";

  return fallback;
};

export const inferProductLineFromPayment = (payment: Record<string, unknown>): PaystackProductLine => {
  const metadata = parsePaystackMetadata(payment.metadata);
  const metaProduct = String(metadata.productLine ?? "").toLowerCase();
  if (metaProduct === "realestate") return "realestate";

  const planObject =
    payment.plan_object && typeof payment.plan_object === "object"
      ? (payment.plan_object as Record<string, unknown>)
      : null;
  const planName = String(planObject?.name ?? "").toLowerCase();
  if (planName.includes("real estate") || planName.includes("realestate")) return "realestate";
  return "shopify";
};

const resolveUserIdFromCustomerEmail = async (
  supabase: SupabaseClient,
  emailRaw: string,
  planKeyHint: string,
): Promise<{ userId: string; productLine: PaystackProductLine; planKey: string } | null> => {
  const email = normalizeEmail(emailRaw);
  if (!email || !email.includes("@")) return null;

  const { data: exactProfile, error: exactError } = await supabase
    .from("profiles")
    .select("user_id, email")
    .ilike("email", email)
    .maybeSingle();
  if (exactError) throw new Error(`Profile lookup failed: ${exactError.message}`);
  if (exactProfile?.user_id) {
    const productLine = await inferProductLineForUser(supabase, exactProfile.user_id as string);
    const planKey = await inferPlanForUser(supabase, exactProfile.user_id as string, planKeyHint, productLine);
    return { userId: exactProfile.user_id as string, productLine, planKey };
  }

  const localPart = email.split("@")[0]?.trim();
  if (localPart) {
    const { data: fuzzyProfiles, error: fuzzyError } = await supabase
      .from("profiles")
      .select("user_id, email")
      .ilike("email", `${localPart}@%`);
    if (fuzzyError) throw new Error(`Profile fuzzy lookup failed: ${fuzzyError.message}`);
    if (fuzzyProfiles?.length === 1 && fuzzyProfiles[0]?.user_id) {
      const userId = fuzzyProfiles[0].user_id as string;
      const productLine = await inferProductLineForUser(supabase, userId);
      const planKey = await inferPlanForUser(supabase, userId, planKeyHint, productLine);
      return { userId, productLine, planKey };
    }
  }

  return null;
};

const inferProductLineForUser = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<PaystackProductLine> => {
  const { data: reProfile, error } = await supabase
    .from("realestate_user_profile")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "shopify";
  if (reProfile?.user_id) return "realestate";
  return "shopify";
};

const inferPlanForUser = async (
  supabase: SupabaseClient,
  userId: string,
  planKeyHint: string,
  productLine: PaystackProductLine,
): Promise<string> => {
  const subTable = productLine === "shopify" ? "subscriptions" : "realestate_subscriptions";
  const { data: subRow } = await supabase.from(subTable).select("plan").eq("user_id", userId).maybeSingle();
  if (subRow?.plan) return String(subRow.plan);
  return planKeyHint || "growth";
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
  let subscriptionCode = String(subscriptionObj?.subscription_code ?? "").trim();
  if (!subscriptionCode) {
    subscriptionCode = extractSubscriptionCodeFromPayment(payment);
  }
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
  if (!planKey) planKey = inferPlanKeyFromPayment(payment, "growth");

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
  let existingCode = existingCodeRows?.[0] ?? null;

  if (!existingCode) {
    const { data: byPlanRows, error: byPlanError } = await supabase
      .from(codesTable)
      .select("id, code, expires_at")
      .eq("user_id", userId)
      .eq("plan", planKey)
      .order("issued_at", { ascending: false })
      .limit(1);
    if (byPlanError) throw new Error(`Access code lookup failed: ${byPlanError.message}`);
    existingCode = byPlanRows?.[0] ?? null;
  }

  if (!existingCode) {
    const { data: latestRows, error: latestError } = await supabase
      .from(codesTable)
      .select("id, code, expires_at")
      .eq("user_id", userId)
      .order("issued_at", { ascending: false })
      .limit(1);
    if (latestError) throw new Error(`Access code lookup failed: ${latestError.message}`);
    existingCode = latestRows?.[0] ?? null;
  }

  let accessCode: string;
  let periodEndIso: string;

  const paidAtRaw = payment.paid_at ?? payment.paidAt;
  const paidAtIso = paidAtRaw ? new Date(String(paidAtRaw)).toISOString() : nowIso;

  if (existingCode) {
    accessCode = existingCode.code as string;
    const paidAtMs = paidAtRaw ? new Date(String(paidAtRaw)).getTime() : NaN;
    const existingExpiryMs = new Date(String(existingCode.expires_at)).getTime();
    const baseMs = Number.isFinite(paidAtMs)
      ? Math.max(paidAtMs, existingExpiryMs)
      : Math.max(nowMs, existingExpiryMs);
    periodEndIso = new Date(baseMs + addMs).toISOString();
    const { error: updCodeErr } = await supabase
      .from(codesTable)
      .update({
        expires_at: periodEndIso,
        status: "active",
        paystack_subscription_code: subscriptionCode,
      })
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
    invoice_date: paidAtIso,
    due_date: periodEndIso,
    status: "paid",
    paid_at: paidAtIso,
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
  const planObject = payment.plan_object;
  if (planObject && typeof planObject === "object" && (planObject as Record<string, unknown>).plan_code) {
    return true;
  }
  const sub = payment.subscription;
  if (sub && typeof sub === "object" && (sub as Record<string, unknown>).subscription_code) return true;
  const meta = parsePaystackMetadata(payment.metadata);
  if (String(meta.billing) === "subscription") return true;
  return false;
};

/** True when the charge belongs to a Paystack subscription already linked in our DB. */
export const paymentLooksLikeKnownSubscription = async (
  supabase: SupabaseClient,
  payment: Record<string, unknown>,
): Promise<boolean> => {
  const subCode = extractSubscriptionCodeFromPayment(payment);
  if (subCode) {
    const { data: shop } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("paystack_subscription_code", subCode)
      .maybeSingle();
    if (shop) return true;
    const { data: re } = await supabase
      .from("realestate_subscriptions")
      .select("id")
      .eq("paystack_subscription_code", subCode)
      .maybeSingle();
    if (re) return true;
  }

  const customerObj =
    payment.customer && typeof payment.customer === "object"
      ? (payment.customer as Record<string, unknown>)
      : null;
  const customerCode = String(customerObj?.customer_code ?? "").trim();
  if (customerCode) {
    const { data: shopCust } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();
    if (shopCust) return true;
    const { data: reCust } = await supabase
      .from("realestate_subscriptions")
      .select("id")
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();
    if (reCust) return true;
  }

  const customerObj2 =
    payment.customer && typeof payment.customer === "object"
      ? (payment.customer as Record<string, unknown>)
      : null;
  const customerEmail = normalizeEmail(customerObj2?.email);
  if (customerEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", customerEmail)
      .maybeSingle();
    if (profile) return true;
  }

  return false;
};

export type ProcessChargeResult =
  | {
    status: "processed";
    alreadyProcessed: boolean;
    reference: string;
    userId: string;
    plan?: string;
    accessCode?: string;
    accessCodeExpiresAt?: string;
  }
  | { status: "ignored"; reason: string }
  | { status: "error"; message: string };

/**
 * Enrich a Paystack charge, resolve the user, and fulfill subscription payment.
 * Used by webhooks, invoice.update, and admin replay.
 */
export const processPaystackSubscriptionCharge = async (params: {
  supabase: SupabaseClient;
  payment: Record<string, unknown>;
  paystackSecret: string;
  overrideUserId?: string;
  overrideProductLine?: PaystackProductLine;
  overrideSubscriptionCode?: string;
}): Promise<ProcessChargeResult> => {
  const { supabase, paystackSecret } = params;
  let payment = params.payment;

  if (String(payment.status ?? "success").toLowerCase() !== "success") {
    return { status: "ignored", reason: "payment_not_successful" };
  }

  payment = await mergePaystackVerifyIntoPayment(payment, paystackSecret);
  payment = await augmentPaystackPaymentWithSubscriptionCode(payment, paystackSecret);

  const manualSubCode = String(params.overrideSubscriptionCode ?? "").trim();
  if (manualSubCode) {
    payment = attachSubscriptionCodeToPayment(payment, manualSubCode);
  }

  if (!extractSubscriptionCodeFromPayment(payment)) {
    const resolvedSub = await resolvePaystackSubscriptionCode(payment, paystackSecret);
    payment = resolvedSub.payment;
  }

  const hasPlan = paymentHasPaystackPlan(payment);
  const knownSubscription = hasPlan ? true : await paymentLooksLikeKnownSubscription(supabase, payment);
  if (!hasPlan && !knownSubscription) {
    return { status: "ignored", reason: "not_subscription_plan" };
  }

  const overrideUserId = String(params.overrideUserId ?? "").trim();
  let resolved: { userId: string; productLine: PaystackProductLine; planKey: string } | null = null;
  try {
    resolved = overrideUserId
      ? {
        userId: overrideUserId,
        productLine: params.overrideProductLine ?? inferProductLineFromPayment(payment),
        planKey: inferPlanKeyFromPayment(payment, "growth"),
      }
      : await resolveUserIdFromChargePayload(supabase, payment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message: `User resolution failed: ${message}` };
  }
  if (!resolved) {
    return { status: "ignored", reason: "unresolved_user" };
  }

  if (!extractSubscriptionCodeFromPayment(payment)) {
    const storedCode = await loadStoredPaystackSubscriptionCode(
      supabase,
      resolved.userId,
      resolved.productLine,
    );
    if (storedCode) {
      payment = attachSubscriptionCodeToPayment(payment, storedCode);
    }
  }

  if (!extractSubscriptionCodeFromPayment(payment)) {
    return {
      status: "error",
      message:
        "Paystack subscription_code missing on verified payment. Open Paystack → Recurring → Subscriptions, copy the SUB_ code for this customer, and replay with that code.",
    };
  }

  try {
    const result = await fulfillPaystackSubscriptionPayment({
      supabase,
      payment,
      userId: resolved.userId,
      productLine: resolved.productLine,
    });
    return {
      status: "processed",
      alreadyProcessed: result.alreadyProcessed,
      reference: result.reference ?? String(payment.reference ?? ""),
      userId: resolved.userId,
      plan: result.plan,
      accessCode: result.accessCode,
      accessCodeExpiresAt: result.accessCodeExpiresAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message };
  }
};

export const fetchVerifiedPaystackTransaction = async (
  reference: string,
  paystackSecret: string,
): Promise<Record<string, unknown>> => {
  const ref = String(reference ?? "").trim();
  if (!ref) throw new Error("Paystack reference is required");

  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
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
  return payment;
};

export const extractTransactionReferenceFromInvoiceEvent = (data: Record<string, unknown>): string => {
  const txn = data.transaction;
  if (txn && typeof txn === "object") {
    const ref = String((txn as Record<string, unknown>).reference ?? "").trim();
    if (ref) return ref;
  }
  return String(data.reference ?? "").trim();
};

export const invoiceUpdateLooksPaid = (data: Record<string, unknown>): boolean => {
  const status = String(data.status ?? "").toLowerCase();
  if (status === "success") return true;
  const txn = data.transaction;
  if (txn && typeof txn === "object") {
    return String((txn as Record<string, unknown>).status ?? "").toLowerCase() === "success";
  }
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
    if (s?.user_id) {
      return { userId: s.user_id as string, productLine: "shopify", planKey: String(s.plan ?? planKeyMeta) };
    }
    const { data: r } = await supabase
      .from("realestate_subscriptions")
      .select("user_id, plan, paystack_subscription_code")
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();
    if (r?.user_id) {
      return { userId: r.user_id as string, productLine: "realestate", planKey: String(r.plan ?? planKeyMeta) };
    }
  }

  const customerEmail = normalizeEmail(customerObj?.email);
  if (customerEmail) {
    const planHint = inferPlanKeyFromPayment(data, planKeyMeta);
    try {
      const fromEmail = await resolveUserIdFromCustomerEmail(supabase, customerEmail, planHint);
      if (fromEmail) return fromEmail;
    } catch {
      /* fall through to other resolvers */
    }
  }

  return null;
};
