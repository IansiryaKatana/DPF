import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PLANS, getPlanByProductId, PlanKey } from "@/config/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import {
  CreditCard, Key, FileText, LogOut, Clock, CheckCircle, AlertTriangle,
  Activity, Shield, Zap, BarChart3, ExternalLink, Download
} from "lucide-react";

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
  const [credentials, setCredentials] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [managingBilling, setManagingBilling] = useState(false);
  const [demoApproved, setDemoApproved] = useState<boolean | null>(null);
  const [activePaymentMethod, setActivePaymentMethod] = useState<string>("stripe");
  const [paypalClientId, setPaypalClientId] = useState<string>("");
  /** Must match Admin → PayPal “Sandbox mode” so plan IDs (P-…) resolve in the same environment as the REST app. */
  const [paypalSandboxMode, setPaypalSandboxMode] = useState(true);
  const [paypalPlanIds, setPaypalPlanIds] = useState<Record<string, string>>({});
  const [clientDeliverableZipUrl, setClientDeliverableZipUrl] = useState("");
  const [resolvedDeliverableUrl, setResolvedDeliverableUrl] = useState<string>("");
  const [resolvingDeliverable, setResolvingDeliverable] = useState(false);
  const [functionsAuthFailed, setFunctionsAuthFailed] = useState(false);
  const [functionsErrorMessage, setFunctionsErrorMessage] = useState<string | null>(null);
  const [isProcessingPayPalPayment, setIsProcessingPayPalPayment] = useState(false);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  const getFreshAccessToken = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("Authentication session error. Please sign in again.");
    const token = data.session?.access_token;
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
        console.error("[FUNCTION DEBUG] fetch error", {
          functionName,
          status: response.status,
          details,
        });
        throw new Error(
          typeof details === "object" && details && "error" in (details as any)
            ? String((details as any).error)
            : `Function ${functionName} failed (${response.status})`
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
      const [subRes, credRes, invRes, profRes, settingsRes] = await Promise.all([
        supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("api_credentials").select("*").eq("user_id", user.id),
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
            "paypal_plan_id_growth",
            "paypal_plan_id_pro",
            "client_deliverable_zip_url",
          ]),
      ]);
      setSubscription(subRes.data);
      setCredentials(credRes.data || []);
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
      setPaypalPlanIds({
        growth: (settingsRows.find((s: any) => s.setting_key === "paypal_plan_id_growth")?.setting_value || "").trim(),
        pro: (settingsRows.find((s: any) => s.setting_key === "paypal_plan_id_pro")?.setting_value || "").trim(),
      });
      const deliverableUrl = (settingsRows.find((s: any) => s.setting_key === "client_deliverable_zip_url")?.setting_value || "").trim();
      setClientDeliverableZipUrl(deliverableUrl);
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

  const handleEmbeddedPayPalCapture = useCallback(
    async (orderId: string) => {
      setIsProcessingPayPalPayment(true);
      try {
        const data = await callEdgeFunction<{ status?: string }>("capture-paypal-order", { orderId });
        if (data?.status === "COMPLETED") {
          toast.success("PayPal card payment completed successfully.");
        } else {
          toast.info("PayPal payment authorized. Please confirm status in admin.");
        }
        const [{ data: subData }, { data: invData }] = await Promise.all([
          supabase.from("subscriptions").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
          supabase.from("invoices").select("*").eq("user_id", user?.id ?? "").order("invoice_date", { ascending: false }),
        ]);
        if (subData) setSubscription(subData);
        setInvoices(invData || []);
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
        const [{ data: subData }, { data: invData }] = await Promise.all([
          supabase.from("subscriptions").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
          supabase.from("invoices").select("*").eq("user_id", user?.id ?? "").order("invoice_date", { ascending: false }),
        ]);
        if (subData) setSubscription(subData);
        setInvoices(invData || []);
      } else {
        toast.info("PayPal payment authorized. Please confirm status in admin.");
      }
    } catch (error: any) {
      toast.error("Failed to finalize PayPal payment: " + (error.message || "Unknown error"));
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

  const trialDaysLeft = subscription?.trial_end
    ? Math.max(0, Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 7;
  const trialRemainingMs = subscription?.trial_end
    ? Math.max(0, new Date(subscription.trial_end).getTime() - nowMs)
    : 7 * 24 * 60 * 60 * 1000;
  const trialHours = Math.floor((trialRemainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const trialMinutes = Math.floor((trialRemainingMs % (60 * 60 * 1000)) / (60 * 1000));
  const trialSeconds = Math.floor((trialRemainingMs % (60 * 1000)) / 1000);
  const trialCountdown = `${trialDaysLeft}d ${String(trialHours).padStart(2, "0")}h ${String(trialMinutes).padStart(2, "0")}m ${String(trialSeconds).padStart(2, "0")}s`;

  const isTrialing = subStatus === "trialing" && !isSubscribed;
  const nextBillingDate = stripeStatus?.subscription_end
    ? new Date(stripeStatus.subscription_end).toLocaleDateString()
    : null;
  const paypalNextBillingDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;
  const displayNextBilling = nextBillingDate || paypalNextBillingDate;

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
      <nav className="border-b border-border bg-card">
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
            <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate("/"); }}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Pending Approval Gate */}
        {demoApproved === false && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="mb-6 border-2 border-destructive/30 bg-destructive/5">
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
            <Card className="mb-6 border-2 border-accent bg-accent/20">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Free Trial — {trialDaysLeft} days remaining</p>
                    <p className="text-sm text-muted-foreground">Add a payment method to continue after your trial</p>
                  </div>
                </div>
                <div className="text-sm font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
                  Trial countdown: {trialCountdown}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Activity, label: "Sync Status", value: "Active", color: "text-green-600" },
            { icon: Zap, label: "Webhooks", value: "6 Active", color: "text-primary" },
            { icon: Shield, label: "Security", value: "HMAC Verified", color: "text-primary" },
            { icon: BarChart3, label: "Invoices Logged", value: String(invoices.length), color: "text-primary" },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}>
              <Card>
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
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl">Subscription & Payments</CardTitle>
              </div>
              <CardDescription>
                {activePaymentMethod === "stripe" ? "Pay securely with card" : "Pay securely with PayPal"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Current Plan */}
              {showCurrentPlanSummary && paidPlanKey && (
                <div className="mb-6 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
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
                          Payment method: {activePaymentMethod === "stripe" ? "Card (Stripe)" : "Card (PayPal)"}
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
                  return (
                    <div
                      key={key}
                      className={`rounded-xl border p-5 flex flex-col ${
                        isCurrent ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="mb-4">
                        {isCurrent && (
                          <Badge variant="default" className="mb-2">Current Plan</Badge>
                        )}
                        <h4 className="text-lg font-semibold text-foreground">{plan.name}</h4>
                        <p className="text-2xl font-bold text-foreground mt-1">
                          ${plan.price.toLocaleString()}
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
                              : plan.billing_type === "one_time"
                              ? "Pay One-Time"
                              : "Start Auto-Billing"}
                          </Button>
                        )}

                        {activePaymentMethod === "paypal" && !isCurrent && (
                          <div className="w-full rounded-lg border border-border p-2 bg-card">
                            {!paypalClientId ? (
                              <p className="text-xs text-destructive">PayPal Client ID not configured for embedded checkout.</p>
                            ) : plan.billing_type === "recurring" ? (
                              !paypalPlanIds[key] ? (
                                <p className="text-xs text-destructive">
                                  Recurring checkout needs a PayPal Subscription Plan ID (starts with{" "}
                                  <span className="font-mono">P-</span>). In{" "}
                                  <span className="font-medium">Admin → Payments → PayPal</span>, save{" "}
                                  {key === "growth" ? "Growth" : "Pro"} Recurring Plan ID — this is unrelated to whether
                                  a client already has a plan; every shopper upgrading to this tier needs it configured
                                  once.
                                </p>
                              ) : (
                                <PayPalScriptProvider
                                  options={{
                                    clientId: paypalClientId,
                                    currency: "USD",
                                    environment: paypalSandboxMode ? "sandbox" : "production",
                                    intent: "subscription",
                                    vault: true,
                                    components: "buttons",
                                    "disable-funding": "paylater,venmo",
                                    // Isolated SDK load: otherwise a sibling card (Enterprise capture) loads
                                    // intent=capture&vault=false first and breaks createSubscription.
                                    dataNamespace: "paypalSubscriptions",
                                  }}
                                >
                                  <PayPalButtons
                                    style={{ layout: "vertical", shape: "rect", label: "subscribe" }}
                                    forceReRender={[paypalSandboxMode, paypalClientId, paypalPlanIds[key] || ""]}
                                    createSubscription={(_data, actions) =>
                                      actions.subscription.create({
                                        plan_id: paypalPlanIds[key],
                                        custom_id: `${user?.id}:${key}`,
                                      })
                                    }
                                    onApprove={async (data) => {
                                      if (!data.subscriptionID) throw new Error("PayPal subscription ID missing");
                                      await callEdgeFunction("activate-paypal-subscription", {
                                        subscriptionId: data.subscriptionID,
                                        planKey: key,
                                      });
                                      toast.success("PayPal subscription is active.");
                                      const [{ data: subData }, { data: invData }] = await Promise.all([
                                        supabase.from("subscriptions").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
                                        supabase.from("invoices").select("*").eq("user_id", user?.id ?? "").order("invoice_date", { ascending: false }),
                                      ]);
                                      if (subData) setSubscription(subData);
                                      setInvoices(invData || []);
                                    }}
                                    onError={(err) => {
                                      console.error("[PAYPAL DEBUG] Subscription checkout error", err);
                                      const msg = typeof err === "object" && err && "message" in err ? String((err as Error).message) : String(err);
                                      if (/popup/i.test(msg) || /blocked/i.test(msg)) {
                                        toast.error("Pop-up was blocked. Allow pop-ups for this site or try another browser, then try again.");
                                      } else if (/RESOURCE_NOT_FOUND|INVALID_RESOURCE_ID/i.test(msg)) {
                                        toast.error(
                                          paypalSandboxMode
                                            ? "PayPal could not find this plan ID in Sandbox. Create the plan in the Sandbox Business account (or turn off Sandbox in Admin if you use live plan IDs)."
                                            : "PayPal could not find this plan ID in Production. Use plan IDs from your live PayPal account, or enable Sandbox in Admin and use sandbox plan IDs."
                                        );
                                      } else {
                                        toast.error("PayPal recurring checkout failed.");
                                      }
                                    }}
                                  />
                                </PayPalScriptProvider>
                              )
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
                                    await handleEmbeddedPayPalCapture(data.orderID);
                                  }}
                                  onError={(err) => {
                                    console.error("[PAYPAL DEBUG] Embedded checkout error", err);
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
                                      toast.error("Embedded PayPal card checkout failed.");
                                    }
                                  }}
                                />
                              </PayPalScriptProvider>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {plan.billing_type === "recurring"
                                ? "Secure recurring billing with PayPal vault and subscription authorization."
                                : "Secure card entry powered by PayPal. No PayPal account required where guest card checkout is eligible."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground mt-4 text-center">
                Growth and Pro auto-renew monthly from signup date. Enterprise is one-time billing only.
              </p>
              {functionsErrorMessage && (
                <p className="text-xs text-destructive mt-2 text-center">{functionsErrorMessage}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* API Credentials */}
        {isSubscribed && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card className="mb-8">
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

        {/* API Credentials */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl">Integration Credentials</CardTitle>
              </div>
              <CardDescription>Your API keys and webhook secrets for integration</CardDescription>
            </CardHeader>
            <CardContent>
              {credentials.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No credentials configured yet. Contact your admin.</p>
              ) : (
                <div className="space-y-3">
                  {credentials.map((cred: any) => (
                    <div key={cred.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg border border-border gap-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${cred.is_active ? "bg-green-500" : "bg-muted-foreground"}`} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{cred.credential_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{cred.credential_value}</p>
                        </div>
                      </div>
                      <Badge variant={cred.is_active ? "default" : "secondary"}>
                        {cred.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Invoices - live data only */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card>
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
                      <tr className="border-b border-border">
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
                          className="border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
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
