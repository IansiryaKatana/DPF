import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PLANS, getPlanByProductId, PlanKey } from "@/config/plans";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import {
  CreditCard, Key, FileText, ArrowUpRight, Clock, CheckCircle, AlertTriangle,
  Activity, Shield, Zap, BarChart3, ExternalLink, Download
} from "lucide-react";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        access_code: string;
        amount?: number;
        currency?: string;
        ref?: string;
        callback: (response: { reference?: string }) => void;
        onClose?: () => void;
      }) => { openIframe: () => void };
    };
  }
}

const ensurePaystackInlineScript = async (): Promise<void> => {
  if (window.PaystackPop) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.paystack.co/v1/inline.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Paystack checkout SDK")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack checkout SDK"));
    document.body.appendChild(script);
  });
};

class FunctionCallError extends Error {
  code?: string;
  paypalIssue?: string;
  paypalDebugId?: string;
  orderId?: string;

  constructor(
    message: string,
    details?: {
      code?: string;
      paypalIssue?: string;
      paypalDebugId?: string;
      orderId?: string;
    },
  ) {
    super(message);
    this.name = "FunctionCallError";
    this.code = details?.code;
    this.paypalIssue = details?.paypalIssue;
    this.paypalDebugId = details?.paypalDebugId;
    this.orderId = details?.orderId;
  }
}

const Dashboard = () => {
  const { user, session, loading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [subscription, setSubscription] = useState<any>(null);
  const [stripeStatus, setStripeStatus] = useState<{
    subscribed: boolean;
    product_id: string | null;
    subscription_end: string | null;
    status: string | null;
  } | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [managingBilling, setManagingBilling] = useState(false);
  const [demoApproved, setDemoApproved] = useState<boolean | null>(null);
  const [activePaymentMethod, setActivePaymentMethod] = useState<string>("stripe");
  const [paypalClientId, setPaypalClientId] = useState<string>("");
  /** Must match Admin PayPal sandbox toggle for the checkout app credentials. */
  const [paypalSandboxMode, setPaypalSandboxMode] = useState(true);
  const [paystackPublicKey, setPaystackPublicKey] = useState<string>("");
  const [planPriceOverrides, setPlanPriceOverrides] = useState<Partial<Record<PlanKey, number>>>({});
  const [clientDeliverableZipUrl, setClientDeliverableZipUrl] = useState("");
  const [resolvedDeliverableUrl, setResolvedDeliverableUrl] = useState<string>("");
  const [resolvingDeliverable, setResolvingDeliverable] = useState(false);
  const [functionsAuthFailed, setFunctionsAuthFailed] = useState(false);
  const [functionsErrorMessage, setFunctionsErrorMessage] = useState<string | null>(null);
  const [isProcessingPayPalPayment, setIsProcessingPayPalPayment] = useState(false);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [latestAccessCode, setLatestAccessCode] = useState<any | null>(null);
  const processedPaystackReferences = useRef<Set<string>>(new Set());

  const getFreshAccessToken = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("Authentication session error. Please sign in again.");

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = data.session?.expires_at ?? 0;
    const tokenNearExpiry = !data.session?.access_token || expiresAt <= nowSeconds + 60;

    let token = data.session?.access_token;
    if (tokenNearExpiry) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw new Error("Session expired. Please sign in again.");
      }
      token = refreshed.session?.access_token;
    }

    if (!token) throw new Error("No valid session. Please sign in again.");
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      console.debug("[AUTH DEBUG] Function token payload", {
        iss: payload?.iss,
        aud: payload?.aud,
        exp: payload?.exp,
        sub: payload?.sub,
      });
    } catch {
      console.debug("[AUTH DEBUG] Could not decode access token payload.");
    }
    return token;
  }, []);

  const callEdgeFunction = useCallback(
    async <T = any>(functionName: string, body?: unknown): Promise<T> => {
      const accessToken = await getFreshAccessToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      });

      let details: unknown = null;
      try {
        details = await response.clone().json();
      } catch {
        try {
          details = await response.clone().text();
        } catch {
          details = null;
        }
      }

      if (!response.ok) {
        const status = response.status;
        console.error("[FUNCTION DEBUG] fetch error", {
          functionName,
          status,
          details,
        });
        if (typeof details === "object" && details) {
          const payload = details as {
            error?: string;
            code?: string;
            paypal_issue?: string;
            paypal_debug_id?: string;
            order_id?: string;
          };
          const baseMessage = payload.error || `Function ${functionName} failed (${status})`;
          const diagnostics = [
            payload.code ? `code=${payload.code}` : null,
            payload.paypal_issue ? `issue=${payload.paypal_issue}` : null,
            payload.paypal_debug_id ? `debug_id=${payload.paypal_debug_id}` : null,
            payload.order_id ? `order_id=${payload.order_id}` : null,
          ].filter(Boolean);
          throw new FunctionCallError(
            diagnostics.length ? `${baseMessage} [${diagnostics.join(", ")}]` : baseMessage,
            {
              code: payload.code,
              paypalIssue: payload.paypal_issue,
              paypalDebugId: payload.paypal_debug_id,
              orderId: payload.order_id,
            },
          );
        }
        throw new Error(
          typeof details === "string" && details
            ? details
            : `Function ${functionName} failed (${status})`
        );
      }

      return details as T;
    },
    [getFreshAccessToken]
  );

  useEffect(() => {
    if (loading) return;
    if (!user || !session) {
      navigate("/login");
      return;
    }
    if (isAdmin) {
      navigate("/admin");
    }
  }, [user, session, loading, isAdmin, navigate]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Subscription activated! Welcome to DataPulseFlow.");
    } else if (checkout === "canceled") {
      toast.info("Checkout was canceled.");
    }
  }, [searchParams]);

  const checkSubscription = useCallback(async () => {
    if (!user || !session || functionsAuthFailed) return;
    try {
      const data = await callEdgeFunction<{
        subscribed: boolean;
        product_id: string | null;
        subscription_end: string | null;
        status: string | null;
      }>("check-subscription");
      setStripeStatus(data);
    } catch (e: any) {
      console.error("Failed to check subscription:", e);
      setFunctionsAuthFailed(true);
      setFunctionsErrorMessage(e?.message || "Failed to load subscription from function.");
      toast.error("Subscription check fallback enabled.");
    }
  }, [user, session, functionsAuthFailed, callEdgeFunction]);

  useEffect(() => {
    if (!user || !session) return;

    const fetchData = async () => {
      const [subRes, invRes, profRes, settingsRes, codeRes] = await Promise.all([
        supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("invoices").select("*").eq("user_id", user.id).order("invoice_date", { ascending: false }).then(res => {
          // Client-side overdue detection
          const now = new Date();
          const enriched = (res.data || []).map((inv: any) => {
            if (inv.status === "pending" && inv.due_date && new Date(inv.due_date) < now) {
              return { ...inv, status: "overdue" };
            }
            return inv;
          });
          return { ...res, data: enriched };
        }),
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("admin_settings")
          .select("setting_key, setting_value")
          .in("setting_key", [
            "active_payment_method",
            "paypal_client_id",
            "paypal_sandbox_mode",
            "paystack_public_key",
            "client_deliverable_zip_url",
            "plan_price_growth",
            "plan_price_pro",
            "plan_price_enterprise",
          ]),
        supabase
          .from("client_access_codes")
          .select("*")
          .eq("user_id", user.id)
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setSubscription(subRes.data);
      setInvoices(invRes.data || []);
      setProfile(profRes.data);
      setDemoApproved(null);
      const settingsRows = settingsRes.data || [];
      const activePaymentMethodSetting = settingsRows.find((s: any) => s.setting_key === "active_payment_method");
      if (activePaymentMethodSetting?.setting_value) setActivePaymentMethod(activePaymentMethodSetting.setting_value);
      const paypalClientIdSetting = settingsRows.find((s: any) => s.setting_key === "paypal_client_id");
      if (paypalClientIdSetting?.setting_value) setPaypalClientId(paypalClientIdSetting.setting_value.trim());
      const sandboxSetting = settingsRows.find((s: any) => s.setting_key === "paypal_sandbox_mode");
      setPaypalSandboxMode(sandboxSetting?.setting_value !== "false");
      const paystackPublicKeySetting = settingsRows.find((s: any) => s.setting_key === "paystack_public_key");
      setPaystackPublicKey((paystackPublicKeySetting?.setting_value || "").trim());
      const deliverableUrl = (settingsRows.find((s: any) => s.setting_key === "client_deliverable_zip_url")?.setting_value || "").trim();
      setClientDeliverableZipUrl(deliverableUrl);
      const toNumberOrNull = (value: string | null | undefined) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };
      const growthPrice = toNumberOrNull(settingsRows.find((s: any) => s.setting_key === "plan_price_growth")?.setting_value);
      const proPrice = toNumberOrNull(settingsRows.find((s: any) => s.setting_key === "plan_price_pro")?.setting_value);
      const enterprisePrice = toNumberOrNull(settingsRows.find((s: any) => s.setting_key === "plan_price_enterprise")?.setting_value);
      setPlanPriceOverrides({
        growth: growthPrice ?? undefined,
        pro: proPrice ?? undefined,
        enterprise: enterprisePrice ?? undefined,
      });
      setLatestAccessCode(codeRes.data || null);
    };
    fetchData();
    checkSubscription();

    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [user, session, checkSubscription]);

  const handleStripeCheckout = async (planKey: PlanKey) => {
    setCheckingOut(planKey);
    try {
      if (!session) throw new Error("Please sign in again.");
      const plan = PLANS[planKey];
      const data = await callEdgeFunction<{ url?: string }>("create-checkout", {
        priceId: plan.price_id,
        billingType: plan.billing_type,
      });
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      toast.error("Failed to start checkout: " + (error.message || "Unknown error"));
    } finally {
      setCheckingOut(null);
    }
  };

  const handlePaystackCheckout = async (planKey: PlanKey) => {
    setCheckingOut(planKey);
    let hostedUrl = "";
    try {
      if (!session) throw new Error("Please sign in again.");
      if (!paystackPublicKey) throw new Error("Paystack public key is not configured.");

      const data = await callEdgeFunction<{
        access_code?: string;
        reference?: string;
        authorization_url?: string;
        amount_minor_units?: number;
        charge_currency?: string;
      }>("create-paystack-checkout", { planKey });
      hostedUrl = data.authorization_url || "";

      if (!data?.access_code) {
        throw new Error("Paystack access code not returned.");
      }

      await ensurePaystackInlineScript();
      if (!window.PaystackPop) throw new Error("Paystack inline checkout SDK not ready.");

      window.PaystackPop
        .setup({
          key: paystackPublicKey,
          email: profile?.email || user?.email || "",
          access_code: data.access_code,
          amount: data.amount_minor_units,
          currency: data.charge_currency || "KES",
          ref: data.reference,
          callback: (response) => {
            const reference = response?.reference || data.reference;
            if (!reference) {
              toast.error("Paystack reference missing after payment.");
              return;
            }
            void handlePaystackVerification(reference);
          },
          onClose: () => {
            toast.info("Paystack payment popup closed.");
          },
        })
        .openIframe();
    } catch (error: any) {
      if (error?.message?.includes("status code 400")) {
        toast.error("Inline checkout failed in test mode. Falling back to hosted Paystack checkout.");
        if (hostedUrl) {
          window.open(hostedUrl, "_blank");
          return;
        }
      }
      toast.error("Failed to start Paystack checkout: " + (error.message || "Unknown error"));
    } finally {
      setCheckingOut(null);
    }
  };

  const handleEmbeddedPayPalCapture = useCallback(
    async (orderId: string) => {
      setIsProcessingPayPalPayment(true);
      try {
        const data = await callEdgeFunction<{ status?: string }>("capture-paypal-order", { orderId });
        if (data?.status === "COMPLETED") {
          toast.success("PayPal card payment completed successfully.");
          if ((data as any)?.accessCode) {
            toast.success(`New 30-day access code issued: ${(data as any).accessCode}`);
          }
        } else {
          toast.info("PayPal payment authorized. Please confirm status in admin.");
        }
        const [{ data: subData }, { data: invData }, { data: codeData }] = await Promise.all([
          supabase.from("subscriptions").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
          supabase.from("invoices").select("*").eq("user_id", user?.id ?? "").order("invoice_date", { ascending: false }),
          supabase
            .from("client_access_codes")
            .select("*")
            .eq("user_id", user?.id ?? "")
            .order("expires_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (subData) setSubscription(subData);
        setInvoices(invData || []);
        setLatestAccessCode(codeData || null);
      } finally {
        setIsProcessingPayPalPayment(false);
      }
    },
    [callEdgeFunction, user?.id]
  );

  const handleManageBilling = async () => {
    setManagingBilling(true);
    try {
      if (!session) throw new Error("Please sign in again.");
      if (activePaymentMethod === "paypal") {
        toast.info("PayPal billing changes are managed by support from the admin side.");
        return;
      }
      const data = await callEdgeFunction<{ url?: string }>("customer-portal");
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      toast.error("Failed to open billing portal: " + (error.message || "Unknown error"));
    } finally {
      setManagingBilling(false);
    }
  };

  const handlePayPalCapture = useCallback(async (orderId: string) => {
    try {
      if (!session) throw new Error("Please sign in again.");
      setIsProcessingPayPalPayment(true);
      const data = await callEdgeFunction<{ status?: string }>("capture-paypal-order", { orderId });
      if (data?.status === "COMPLETED") {
        toast.success("PayPal payment completed successfully.");
        if (data?.accessCode) {
          toast.success(`New 30-day access code issued: ${data.accessCode}`);
        }
        const [{ data: subData }, { data: invData }] = await Promise.all([
          supabase.from("subscriptions").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
          supabase.from("invoices").select("*").eq("user_id", user?.id ?? "").order("invoice_date", { ascending: false }),
        ]);
        const { data: codeData } = await supabase
          .from("client_access_codes")
          .select("*")
          .eq("user_id", user?.id ?? "")
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subData) setSubscription(subData);
        setInvoices(invData || []);
        setLatestAccessCode(codeData || null);
      } else {
        toast.info("PayPal payment authorized. Please confirm status in admin.");
      }
    } catch (error: any) {
      toast.error("Failed to finalize PayPal payment: " + (error.message || "Unknown error"));
    } finally {
      setIsProcessingPayPalPayment(false);
    }
  }, [user?.id, session, callEdgeFunction]);

  const handlePaystackVerification = useCallback(async (reference: string) => {
    try {
      if (!session) throw new Error("Please sign in again.");
      setIsProcessingPayPalPayment(true);
      const data = await callEdgeFunction<{ status?: string; accessCode?: string }>(
        "verify-paystack-payment",
        { reference },
      );
      if (data?.status === "COMPLETED") {
        toast.success("Paystack payment completed successfully.");
        if (data?.accessCode) {
          toast.success(`New 30-day access code issued: ${data.accessCode}`);
        }
        const [{ data: subData }, { data: invData }] = await Promise.all([
          supabase.from("subscriptions").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
          supabase.from("invoices").select("*").eq("user_id", user?.id ?? "").order("invoice_date", { ascending: false }),
        ]);
        const { data: codeData } = await supabase
          .from("client_access_codes")
          .select("*")
          .eq("user_id", user?.id ?? "")
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subData) setSubscription(subData);
        setInvoices(invData || []);
        setLatestAccessCode(codeData || null);
      } else {
        toast.info("Paystack payment is pending verification.");
      }
    } catch (error: any) {
      toast.error("Failed to verify Paystack payment: " + (error.message || "Unknown error"));
    } finally {
      setIsProcessingPayPalPayment(false);
    }
  }, [user?.id, session, callEdgeFunction]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout !== "paypal-success") return;
    const orderId = searchParams.get("token");
    if (!orderId) return;
    void handlePayPalCapture(orderId);
  }, [searchParams, handlePayPalCapture]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout !== "paystack-success") return;
    const reference = searchParams.get("reference") || searchParams.get("trxref");
    if (!reference) return;
    if (processedPaystackReferences.current.has(reference)) return;
    processedPaystackReferences.current.add(reference);
    navigate("/dashboard", { replace: true });
    void handlePaystackVerification(reference);
  }, [searchParams, handlePaystackVerification, navigate]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const resolveDeliverableUrl = async () => {
      const raw = (clientDeliverableZipUrl || "").trim();
      if (!raw) {
        setResolvedDeliverableUrl("https://datapulseflow.com/deliverables/client-deliverable.zip");
        return;
      }

      if (!raw.startsWith("storage://")) {
        setResolvedDeliverableUrl(raw);
        return;
      }

      const withoutScheme = raw.replace("storage://", "");
      const firstSlashIdx = withoutScheme.indexOf("/");
      if (firstSlashIdx < 1) {
        setResolvedDeliverableUrl("");
        return;
      }
      const bucket = withoutScheme.slice(0, firstSlashIdx);
      const objectPath = withoutScheme.slice(firstSlashIdx + 1);

      setResolvingDeliverable(true);
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(objectPath, 60 * 60);
        if (error) throw error;
        setResolvedDeliverableUrl(data?.signedUrl || "");
      } catch (error: any) {
        setResolvedDeliverableUrl("");
        toast.error(
          "Could not generate deliverable download link. Please contact admin to verify storage read policies."
        );
      } finally {
        setResolvingDeliverable(false);
      }
    };

    void resolveDeliverableUrl();
  }, [clientDeliverableZipUrl]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><p>Loading...</p></div>;

  const isSubscribed = stripeStatus?.subscribed || subscription?.status === "active";
  const currentPlan = isSubscribed
    ? (stripeStatus?.product_id
        ? getPlanByProductId(stripeStatus.product_id)
        : (subscription?.plan as PlanKey | null) ?? null)
    : null;
  /** Plan key once user is on a paid/active subscription (top summary + hide duplicate grid card). */
  const paidPlanKey =
    isSubscribed && currentPlan
      ? currentPlan
      : isSubscribed && subscription?.plan
        ? (subscription.plan as PlanKey)
        : null;
  const showCurrentPlanSummary = isSubscribed && paidPlanKey != null && paidPlanKey in PLANS;
  const subStatus = stripeStatus?.status || subscription?.status || "trialing";

  const trialRemainingMs = subscription?.trial_end
    ? Math.max(0, new Date(subscription.trial_end).getTime() - nowMs)
    : 7 * 24 * 60 * 60 * 1000;
  const trialDaysLeft = Math.floor(trialRemainingMs / (24 * 60 * 60 * 1000));
  const trialHours = Math.floor((trialRemainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const trialMinutes = Math.floor((trialRemainingMs % (60 * 60 * 1000)) / (60 * 1000));
  const trialSeconds = Math.floor((trialRemainingMs % (60 * 1000)) / 1000);
  const trialCountdown = `${trialDaysLeft}d ${String(trialHours).padStart(2, "0")}h ${String(trialMinutes).padStart(2, "0")}m ${String(trialSeconds).padStart(2, "0")}s`;

  const isTrialing = subStatus === "trialing" && !isSubscribed;
  const isTrialExpired = isTrialing && trialRemainingMs <= 0;
  const nextBillingDate = stripeStatus?.subscription_end
    ? new Date(stripeStatus.subscription_end).toLocaleDateString()
    : null;
  const paypalNextBillingDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;
  const displayNextBilling = nextBillingDate || paypalNextBillingDate;
  const accessCodeExpiryMs = latestAccessCode?.expires_at ? new Date(latestAccessCode.expires_at).getTime() : 0;
  const isLifetimeCode = latestAccessCode?.plan === "enterprise";
  const accessCodeValid = Boolean(
    latestAccessCode &&
      latestAccessCode.status === "active" &&
      (isLifetimeCode || accessCodeExpiryMs > nowMs),
  );
  const isSystemLocked = !accessCodeValid;

  return (
    <div className="min-h-screen bg-background">
      {isProcessingPayPalPayment && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <p className="text-lg font-semibold text-foreground">Finalizing Payment</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Processing your PayPal card payment securely. Please do not close this page.
            </p>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-1/3 bg-primary animate-pulse" />
            </div>
          </div>
        </div>
      )}
      {/* Top nav */}
      <nav className="bg-card/90 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="3" width="6" height="12" rx="1" fill="hsl(var(--primary-foreground))" />
                <rect x="10" y="6" width="6" height="9" rx="1" fill="hsl(var(--primary-foreground))" opacity="0.7" />
              </svg>
            </div>
            <span className="text-lg font-serif-display text-foreground">DataPulseFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">{profile?.email || user?.email}</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  className="bg-foreground text-background hover:bg-foreground/85"
                >
                  Sign Out <ArrowUpRight className="w-4 h-4 ml-2" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be logged out of your DataPulseFlow dashboard.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { signOut(); navigate("/"); }}>
                    Sign Out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Pending Approval Gate */}
        {demoApproved === false && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="mb-6 border-0 bg-gradient-to-r from-destructive/20 via-destructive/10 to-transparent shadow-sm">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  <div>
                    <p className="font-medium text-foreground">Account Pending Approval</p>
                    <p className="text-sm text-muted-foreground">Your demo request is being reviewed. You'll get full access once approved by an admin.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-serif-display text-foreground mb-2">
            Welcome, {profile?.full_name || "there"}
          </h1>
          <p className="text-muted-foreground">Manage your DataPulseFlow integration platform</p>
        </motion.div>

        {/* Trial Banner */}
        {isTrialing && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card
              className={`mb-6 border-0 shadow-sm ${
                isTrialExpired
                  ? "bg-gradient-to-r from-[#4a1212] via-[#7a1f1f] to-[#b73232]"
                  : "bg-gradient-to-r from-[#122a4a] via-[#1b3e69] to-[#25548a]"
              }`}
            >
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-white" />
                  <div>
                    <p className="font-medium text-white">
                      {isTrialExpired ? "Free Trial Expired" : `Free Trial — ${trialDaysLeft} days remaining`}
                    </p>
                    <p className="text-sm text-white/85">
                      {isTrialExpired
                        ? "Renew with a paid plan to continue access."
                        : "Add a payment method to continue after your trial"}
                    </p>
                  </div>
                </div>
                <div className="text-lg sm:text-xl font-bold text-white bg-white/15 rounded-md px-3 py-2 tracking-wide">
                  {trialCountdown}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              icon: Activity,
              label: "Sync Status",
              value: isSystemLocked ? "Locked" : "Active",
              color: isSystemLocked ? "text-destructive" : "text-green-600",
            },
            { icon: Zap, label: "Webhooks", value: "6 Active", color: "text-primary" },
            { icon: Shield, label: "Security", value: "HMAC Verified", color: "text-primary" },
            { icon: BarChart3, label: "Invoices Logged", value: String(invoices.length), color: "text-primary" },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}>
              <Card className="border-0 bg-gradient-to-br from-card via-card to-muted/20 shadow-sm">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="p-2 rounded-lg bg-accent/50">
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-lg font-semibold text-foreground">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Subscription + Payment - only show active method */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="mb-8 border-0 bg-gradient-to-br from-card via-card to-muted/15 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl">Subscription & Payments</CardTitle>
              </div>
              <CardDescription>
                {activePaymentMethod === "stripe"
                  ? "Pay securely with Stripe"
                  : activePaymentMethod === "paypal"
                  ? "Pay securely with PayPal"
                  : "Pay securely with Paystack"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Current Plan */}
              {showCurrentPlanSummary && paidPlanKey && (
                <div className="mb-6 rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-primary/80 mb-1">Current Plan</p>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-semibold text-foreground">{PLANS[paidPlanKey].name}</h3>
                        <Badge variant="default">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {subStatus === "trialing" ? "Trial" : "Active"}
                        </Badge>
                      </div>
                      <p className="text-3xl font-bold text-foreground">
                        ${PLANS[paidPlanKey].price.toLocaleString()}
                        <span className="text-sm font-normal text-muted-foreground">
                          {PLANS[paidPlanKey].billing_type === "one_time" ? " one-time" : "/month"}
                        </span>
                      </p>
                      <div className="mt-2 space-y-1">
                        {PLANS[paidPlanKey].billing_type === "recurring" && displayNextBilling && (
                          <p className="text-sm text-muted-foreground">Next auto-charge: {displayNextBilling}</p>
                        )}
                        {PLANS[paidPlanKey].billing_type === "recurring" &&
                          activePaymentMethod === "paypal" &&
                          subscription?.stripe_subscription_id?.startsWith("paypal_sub:") && (
                          <p className="text-xs text-muted-foreground">
                            Recurring billing runs on PayPal’s schedule; renewals appear in your invoices when synced.
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Payment method: {activePaymentMethod === "stripe" ? "Card (Stripe)" : activePaymentMethod === "paypal" ? "Card (PayPal)" : "Card (Paystack)"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManageBilling}
                      disabled={
                        managingBilling ||
                        activePaymentMethod === "paypal"
                      }
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {managingBilling
                        ? "Loading..."
                        : activePaymentMethod === "paypal"
                        ? "Managed by Support"
                        : "Manage Billing"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Plan Selection - only active payment method */}
              <div
                className={`grid gap-4 ${
                  (Object.keys(PLANS) as PlanKey[]).filter((k) => !(showCurrentPlanSummary && paidPlanKey === k)).length <= 2
                    ? "sm:grid-cols-2"
                    : "sm:grid-cols-3"
                }`}
              >
                {(Object.entries(PLANS) as [PlanKey, typeof PLANS[PlanKey]][])
                  .filter(([key]) => !(showCurrentPlanSummary && paidPlanKey === key))
                  .map(([key, plan]) => {
                  const isCurrent = currentPlan === key;
                  const isEnterprise = key === "enterprise";
                  const planShadeClass = isCurrent
                    ? "bg-gradient-to-br from-sky-500/40 via-sky-500/30 to-sky-500/20 shadow-lg shadow-sky-500/25"
                    : key === "growth"
                    ? "bg-gradient-to-br from-sky-500/20 via-sky-400/10 to-transparent shadow-md shadow-sky-500/20"
                    : key === "pro"
                    ? "bg-gradient-to-br from-sky-500/30 via-sky-400/20 to-transparent shadow-md shadow-sky-500/25"
                    : "bg-gradient-to-br from-sky-600/40 via-sky-500/25 to-transparent shadow-md shadow-sky-600/30";
                  return (
                    <div
                      key={key}
                      className={`rounded-xl p-5 flex flex-col min-h-[240px] ${planShadeClass}`}
                    >
                      <div className="mb-4">
                        {isCurrent && (
                          <Badge variant="default" className="mb-2">Current Plan</Badge>
                        )}
                        <h4 className="text-lg font-semibold text-foreground">{plan.name}</h4>
                        <p className="text-2xl font-bold text-foreground mt-1">
                          ${(planPriceOverrides[key] ?? plan.price).toLocaleString()}
                          <span className="text-sm font-normal text-muted-foreground">
                            {isEnterprise ? " one-time" : "/mo"}
                          </span>
                        </p>
                      </div>

                      <div className="space-y-2 mt-auto">
                        {activePaymentMethod === "stripe" && (
                          <Button
                            variant={isCurrent ? "outline" : "hero"}
                            size="sm"
                            className="w-full"
                            onClick={() => handleStripeCheckout(key)}
                            disabled={checkingOut === key || isCurrent}
                          >
                            <CreditCard className="w-4 h-4 mr-2" />
                            {isCurrent
                              ? "Current"
                              : checkingOut === key
                              ? "Loading..."
                              : "Pay One-Time"}
                          </Button>
                        )}

                        {activePaymentMethod === "paystack" && (
                          <Button
                            variant={isCurrent ? "outline" : "hero"}
                            size="sm"
                            className="w-full rounded-md py-6 px-4 justify-between"
                            onClick={() => handlePaystackCheckout(key)}
                            disabled={checkingOut === key || isCurrent}
                          >
                            {isCurrent
                              ? "Current"
                              : checkingOut === key
                              ? "Starting secure checkout..."
                              : "Pay with Debit or Credit Card"}
                            <CreditCard className="w-4 h-4 ml-2" />
                          </Button>
                        )}

                        {activePaymentMethod === "paypal" && !isCurrent && (
                          <div className="w-full rounded-lg p-2 bg-background/70 backdrop-blur-sm">
                            {!paypalClientId ? (
                              <p className="text-xs text-destructive">PayPal Client ID not configured for embedded checkout.</p>
                            ) : (
                              <PayPalScriptProvider
                                options={{
                                  clientId: paypalClientId,
                                  currency: "USD",
                                  environment: paypalSandboxMode ? "sandbox" : "production",
                                  intent: "capture",
                                  components: "buttons",
                                  "enable-funding": "card",
                                  "disable-funding": "paylater,venmo",
                                  dataNamespace: "paypalCapture",
                                }}
                              >
                                <PayPalButtons
                                  fundingSource="card"
                                  style={{ layout: "vertical", shape: "rect", label: "pay" }}
                                  forceReRender={[paypalSandboxMode, paypalClientId]}
                                  createOrder={async () => {
                                    if (functionsAuthFailed) {
                                      throw new Error("Payment service auth is unavailable. Please sign out/in, then retry.");
                                    }
                                    const data = await callEdgeFunction<{ orderId?: string }>(
                                      "create-paypal-checkout",
                                      { planKey: key }
                                    );
                                    if (!data?.orderId) {
                                      throw new Error("Failed to initialize PayPal card checkout");
                                    }
                                    return data.orderId;
                                  }}
                                  onApprove={async (data) => {
                                    if (!data.orderID) throw new Error("PayPal order ID missing");
                                    try {
                                      await handleEmbeddedPayPalCapture(data.orderID);
                                    } catch (err) {
                                      // Keep this throw so the PayPal SDK can recover where possible.
                                      throw err;
                                    }
                                  }}
                                  onError={(err) => {
                                    console.error("[PAYPAL DEBUG] Embedded checkout error", err);
                                    if (err instanceof FunctionCallError) {
                                      if (err.code === "PAYPAL_CAPTURE_FAILED" && err.paypalIssue === "INSTRUMENT_DECLINED") {
                                        toast.error(
                                          `Card was declined. Ask client to retry with the same card once, then use another card if it fails again. Reference: ${err.paypalDebugId || "n/a"}`
                                        );
                                        return;
                                      }
                                      toast.error(err.message);
                                      return;
                                    }
                                    const msg = typeof err === "object" && err && "message" in err ? String((err as Error).message) : String(err);
                                    if (/popup/i.test(msg) || /blocked/i.test(msg)) {
                                      toast.error(
                                        "Pop-up was blocked. Allow pop-ups for this site (or use a browser that permits them for this origin)."
                                      );
                                    } else if (/Client Authentication failed|AUTHENTICATION_FAILURE/i.test(msg)) {
                                      toast.error(
                                        "PayPal rejected the checkout. In Admin, match Sandbox mode with your PayPal app (Sandbox ID/secret vs Live), then retry. Test checkout in Chrome or Edge, not an embedded preview."
                                      );
                                    } else {
                                      toast.error(msg || "Embedded PayPal card checkout failed.");
                                    }
                                  }}
                                />
                              </PayPalScriptProvider>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground mt-4 text-center">
                Every plan is one-time and issues a 30-day access code.
              </p>
              {functionsErrorMessage && (
                <p className="text-xs text-destructive mt-2 text-center">{functionsErrorMessage}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
          <Card className="mb-8 border-0 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl">{isLifetimeCode ? "Lifetime Access Code" : "30-Day Access Code"}</CardTitle>
              </div>
              <CardDescription>
                {isSystemLocked
                  ? "Your access code expired. Data pulling is locked until a new valid code is entered."
                  : isLifetimeCode
                  ? "Your Enterprise license is lifetime and keeps data pull access unlocked."
                  : "Your data pull access is active while this code remains valid."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestAccessCode ? (
                <div className="rounded-lg p-3 bg-muted/40">
                  <p className="text-xs text-muted-foreground">Latest issued code</p>
                  <p className="font-mono text-sm text-foreground">{latestAccessCode.code}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expires: {new Date(latestAccessCode.expires_at).toLocaleString()}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No access code issued yet for this account.</p>
              )}
              <p className="text-xs text-muted-foreground">
                {isLifetimeCode
                  ? "Enter this code in SalesPortal Settings to unlock lifetime sync."
                  : "Enter this code in SalesPortal Settings to unlock/continue sync for the next 30 days."}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* API Credentials */}
        {isSubscribed && !isSystemLocked && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card className="mb-8 border-0 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-primary" />
                  <CardTitle className="text-xl">Client Deliverable</CardTitle>
                </div>
                <CardDescription>
                  Your payment is confirmed. Download your deliverable ZIP package below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild disabled={!resolvedDeliverableUrl || resolvingDeliverable}>
                  <a href={resolvedDeliverableUrl || "#"} target="_blank" rel="noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    {resolvingDeliverable ? "Preparing Download..." : "Download Deliverable ZIP"}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Invoices - live data only */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-0 bg-gradient-to-br from-card via-card to-muted/10 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl">Invoices</CardTitle>
              </div>
              <CardDescription>Your billing history</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No invoices yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="text-left py-2 text-muted-foreground font-medium">Description</th>
                        <th className="text-left py-2 text-muted-foreground font-medium">Date</th>
                        <th className="text-left py-2 text-muted-foreground font-medium">Amount</th>
                        <th className="text-left py-2 text-muted-foreground font-medium">Status</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv: any) => (
                        <tr
                          key={inv.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => navigate(`/invoice/${inv.id}`)}
                        >
                          <td className="py-3 text-foreground">{inv.description || "—"}</td>
                          <td className="py-3 text-muted-foreground">{new Date(inv.invoice_date).toLocaleDateString()}</td>
                          <td className="py-3 text-foreground font-medium">
                            {inv.currency?.toUpperCase()} {Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3">
                            <Badge variant={inv.status === "paid" ? "default" : inv.status === "pending" ? "secondary" : "destructive"}>
                              {inv.status === "paid" && <CheckCircle className="w-3 h-3 mr-1" />}
                              {inv.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                              {inv.status === "overdue" && <AlertTriangle className="w-3 h-3 mr-1" />}
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/invoice/${inv.id}`);
                              }}
                              title="View / Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
