import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PRICES_USD: Record<string, number> = {
  growth: 500,
  pro: 700,
};

const PAYSTACK_PLAN_SETTING_KEYS: Record<string, string> = {
  growth: "paystack_plan_code_shopify_growth",
  pro: "paystack_plan_code_shopify_pro",
};

/** Paystack metadata values must be strings; omit null/undefined. */
const stringifyMetadata = (fields: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
};

const getUsdToKesRate = async (fallbackRate: number | null): Promise<{ rate: number; source: string }> => {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const rate = Number(json?.rates?.KES);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("invalid rate payload");
    }

    return { rate, source: "er-api" };
  } catch (error) {
    if (fallbackRate && Number.isFinite(fallbackRate) && fallbackRate > 0) {
      return { rate: fallbackRate, source: "admin_settings_fallback" };
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FX lookup failed: ${message}`);
  }
};

const ensurePaystackPlanCode = async (params: {
  supabase: ReturnType<typeof createClient>;
  paystackSecret: string;
  planSettingKey: string;
  amountMinorUnits: number;
  currency: string;
  interval: string;
  planDisplayName: string;
}): Promise<string> => {
  const { supabase, paystackSecret, planSettingKey, amountMinorUnits, currency, interval, planDisplayName } = params;

  const { data: row } = await supabase
    .from("admin_settings")
    .select("setting_value")
    .eq("setting_key", planSettingKey)
    .maybeSingle();

  const existingCode = String(row?.setting_value ?? "").trim();
  if (existingCode) {
    const fetchRes = await fetch(`https://api.paystack.co/plan/${encodeURIComponent(existingCode)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
    });
    const fetchJson = await fetchRes.json();
    if (fetchRes.ok && fetchJson?.status && fetchJson?.data) {
      const p = fetchJson.data;
      const sameAmount = Number(p.amount) === amountMinorUnits;
      const sameCurrency = String(p.currency || "").toUpperCase() === currency.toUpperCase();
      const sameInterval = String(p.interval || "") === interval;
      if (sameAmount && sameCurrency && sameInterval) {
        return existingCode;
      }
    }
  }

  const createRes = await fetch("https://api.paystack.co/plan", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: planDisplayName.slice(0, 100),
      amount: amountMinorUnits,
      interval,
      currency,
      description: "DataPulseFlow Shopify subscription",
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson?.status || !createJson?.data?.plan_code) {
    throw new Error(`Paystack plan create failed (${createRes.status}): ${createJson?.message || "unknown error"}`);
  }
  const newCode = createJson.data.plan_code as string;

  const { error: upsertError } = await supabase.from("admin_settings").upsert(
    {
      setting_key: planSettingKey,
      setting_value: newCode,
      is_encrypted: false,
    },
    { onConflict: "setting_key" },
  );
  if (upsertError) {
    throw new Error(`Failed to store Paystack plan code: ${upsertError.message}`);
  }

  return newCode;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    let body: { planKey?: string } = {};
    try {
      body = await req.json();
    } catch {
      throw new Error("Request body must be valid JSON with planKey.");
    }
    const planKey = String(body?.planKey ?? "").trim();
    if (!planKey || !PLAN_PRICES_USD[planKey]) {
      throw new Error("Invalid plan for subscription (only growth and pro).");
    }

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "paystack_secret_key",
        "paystack_charge_currency",
        "usd_kes_rate",
        "plan_price_growth",
        "plan_price_pro",
        PAYSTACK_PLAN_SETTING_KEYS[planKey as keyof typeof PAYSTACK_PLAN_SETTING_KEYS],
      ]);

    if (settingsError) throw new Error(`Failed to load Paystack settings: ${settingsError.message}`);
    const paystackSecret = String(
      settings?.find((s) => s.setting_key === "paystack_secret_key")?.setting_value ?? "",
    ).trim();
    if (!paystackSecret) throw new Error("Paystack secret key is missing in admin settings");
    if (!/^sk_(test|live)_/i.test(paystackSecret)) {
      throw new Error("Paystack secret key format is invalid. Expected sk_test_* or sk_live_*.");
    }

    const parsePlanPrice = (value: string | null | undefined, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const resolvedPlanPrices: Record<string, number> = {
      growth: parsePlanPrice(settings?.find((s) => s.setting_key === "plan_price_growth")?.setting_value, 500),
      pro: parsePlanPrice(settings?.find((s) => s.setting_key === "plan_price_pro")?.setting_value, 700),
    };
    const fallbackFxRate = parsePlanPrice(
      settings?.find((s) => s.setting_key === "usd_kes_rate")?.setting_value,
      0,
    );
    const planAmountUsd = resolvedPlanPrices[planKey as keyof typeof resolvedPlanPrices];
    const configuredCurrency = String(
      settings?.find((s) => s.setting_key === "paystack_charge_currency")?.setting_value ?? "KES",
    ).toUpperCase();
    const chargeCurrency = configuredCurrency === "USD" ? "USD" : "KES";
    let amountInMinorUnits = 0;
    let chargedAmount = planAmountUsd;
    let fxSource = "not-required";
    let usdToKesRate: number | null = null;

    if (chargeCurrency === "USD") {
      amountInMinorUnits = Math.round(planAmountUsd * 100);
      chargedAmount = planAmountUsd;
    } else {
      const fx = await getUsdToKesRate(fallbackFxRate > 0 ? fallbackFxRate : null);
      usdToKesRate = fx.rate;
      fxSource = fx.source;
      const planAmountKes = Number((planAmountUsd * fx.rate).toFixed(2));
      amountInMinorUnits = Math.round(planAmountKes * 100);
      chargedAmount = planAmountKes;
    }

    const planCodeSetting = PAYSTACK_PLAN_SETTING_KEYS[planKey as keyof typeof PAYSTACK_PLAN_SETTING_KEYS];
    const planDisplayName = `DataPulseFlow Shopify ${planKey === "growth" ? "Growth" : "Pro"} (${chargeCurrency})`;
    const paystackPlanCode = await ensurePaystackPlanCode({
      supabase,
      paystackSecret,
      planSettingKey: planCodeSetting,
      amountMinorUnits: amountInMinorUnits,
      currency: chargeCurrency,
      interval: "monthly",
      planDisplayName,
    });

    const origin = req.headers.get("origin") || "http://localhost:8081";
    const isLocalOrigin = /localhost|127\.0\.0\.1/i.test(origin);
    const reference = `DPF_SUB_${userData.user.id}_${planKey}_${Date.now()}`;

    const metadata = stringifyMetadata({
      userId: userData.user.id,
      planKey,
      productLine: "shopify",
      billing: "subscription",
      platform: "DataPulseFlow",
      requested_currency: "USD",
      requested_amount_usd: planAmountUsd,
      charged_currency: chargeCurrency,
      charged_amount: chargedAmount,
      ...(chargeCurrency === "KES" ? { charged_amount_kes: chargedAmount } : {}),
      ...(usdToKesRate != null ? { usd_to_kes_rate: usdToKesRate } : {}),
      fx_source: fxSource,
    });

    const payload: Record<string, unknown> = {
      email: userData.user.email,
      amount: amountInMinorUnits,
      plan: paystackPlanCode,
      reference,
      metadata,
    };
    if (!isLocalOrigin && /^sk_test_/i.test(paystackSecret)) {
      throw new Error("Production checkout is using a Paystack test secret key. Switch admin setting to sk_live_*.");
    }
    if (!isLocalOrigin) {
      payload.callback_url = `${origin}/dashboard?checkout=paystack-success`;
    }

    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const initJson = await initRes.json();
    if (!initRes.ok || !initJson?.status || !initJson?.data?.authorization_url) {
      throw new Error(
        `Paystack initialize failed (${initRes.status}): ${initJson?.message || "unknown error"}`,
      );
    }

    return new Response(
      JSON.stringify({
        authorization_url: initJson.data.authorization_url,
        access_code: initJson.data.access_code,
        reference: initJson.data.reference,
        amount_minor_units: amountInMinorUnits,
        charge_currency: chargeCurrency,
        key_mode: /^sk_live_/i.test(paystackSecret) ? "live" : "test",
        display_currency: "USD",
        display_amount: planAmountUsd,
        billing: "subscription",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-paystack-subscription-checkout]", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
