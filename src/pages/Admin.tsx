import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { sendNotifyEmail } from "@/lib/send-email";
import { demoApprovedEmail, demoRejectedEmail } from "@/lib/email-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Settings, Users, CreditCard, FileText, Shield, Save,
  Eye, EyeOff, CheckCircle, Clock, AlertTriangle, Building2, Receipt, Mail
} from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import BrandingSettings from "@/components/admin/BrandingSettings";
import InvoiceManager from "@/components/admin/InvoiceManager";
import EmailLogView from "@/components/admin/EmailLogView";

const Admin = () => {
  const { user, session, loading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [stripe, setStripe] = useState({ publishableKey: "", secretKey: "" });
  const [paypal, setPaypal] = useState({
    clientId: "",
    clientSecret: "",
    sandboxMode: true,
  });
  const [paystack, setPaystack] = useState({
    publicKey: "",
    secretKey: "",
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingDeliverable, setUploadingDeliverable] = useState(false);
  const [demoRequests, setDemoRequests] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [activePaymentMethod, setActivePaymentMethod] = useState<string>("stripe");
  const [clientDeliverableZipUrl, setClientDeliverableZipUrl] = useState("");
  const [planPricing, setPlanPricing] = useState({
    growth: "500",
    pro: "700",
    enterprise: "12000",
  });
  const [supportContactEmail, setSupportContactEmail] = useState("support@datapulseflow.com");
  const [resendApiKey, setResendApiKey] = useState("");

  const buildAccessCode = () => {
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const chunk = (size: number) =>
      Array.from({ length: size }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
    return `DPF-${chunk(4)}-${chunk(4)}-${chunk(4)}`;
  };

  useEffect(() => {
    if (!loading && (!user || !session)) {
      navigate("/login");
      return;
    }
    if (!loading && user && !isAdmin) {
      navigate("/dashboard");
    }
  }, [user, session, loading, isAdmin, navigate]);

  useEffect(() => {
    if (loading || !user || !session || !isAdmin) return;

    const fetchData = async () => {
      // Fetch admin settings
      const { data: settings } = await supabase.from("admin_settings").select("*");
      if (settings) {
        settings.forEach((s: any) => {
          if (s.setting_key === "stripe_publishable_key") setStripe(prev => ({ ...prev, publishableKey: s.setting_value || "" }));
          if (s.setting_key === "stripe_secret_key") setStripe(prev => ({ ...prev, secretKey: s.setting_value || "" }));
          if (s.setting_key === "paypal_client_id") setPaypal(prev => ({ ...prev, clientId: s.setting_value || "" }));
          if (s.setting_key === "paypal_client_secret") setPaypal(prev => ({ ...prev, clientSecret: s.setting_value || "" }));
          if (s.setting_key === "paypal_sandbox_mode") setPaypal(prev => ({ ...prev, sandboxMode: s.setting_value === "true" }));
          if (s.setting_key === "paystack_public_key") setPaystack(prev => ({ ...prev, publicKey: s.setting_value || "" }));
          if (s.setting_key === "paystack_secret_key") setPaystack(prev => ({ ...prev, secretKey: s.setting_value || "" }));
          if (s.setting_key === "client_deliverable_zip_url") setClientDeliverableZipUrl(s.setting_value || "");
          if (s.setting_key === "plan_price_growth") setPlanPricing(prev => ({ ...prev, growth: s.setting_value || prev.growth }));
          if (s.setting_key === "plan_price_pro") setPlanPricing(prev => ({ ...prev, pro: s.setting_value || prev.pro }));
          if (s.setting_key === "plan_price_enterprise") setPlanPricing(prev => ({ ...prev, enterprise: s.setting_value || prev.enterprise }));
          if (s.setting_key === "support_contact_email") setSupportContactEmail(s.setting_value || "support@datapulseflow.com");
          if (s.setting_key === "resend_api_key") setResendApiKey(s.setting_value || "");
        });
      }

      // Fetch demo requests
      const { data: demos, error: demosErr } = await supabase.from("demo_requests").select("*").order("created_at", { ascending: false });
      if (demosErr) {
        // Avoid noisy permission toasts; guard/redirect handles unauthorized users.
        console.error("Demo requests fetch error:", demosErr);
      }
      setDemoRequests(demos || []);

      // Fetch clients (profiles + subscriptions)
      const { data: profilesData } = await supabase.from("profiles").select("*");
      const { data: subsData } = await supabase.from("subscriptions").select("*");
      if (profilesData && subsData) {
        const merged = profilesData.map((p: any) => {
          const sub = subsData.find((s: any) => s.user_id === p.user_id);
          return {
            id: p.id,
            user_id: p.user_id,
            name: p.full_name || p.email || "Unknown",
            email: p.email || "",
            plan: sub?.plan || "—",
            status: sub?.status || "—",
            company: p.company_name || "",
          };
        });
        setClients(merged);
      }

      // Fetch active payment method
      const apm = settings?.find((s: any) => s.setting_key === "active_payment_method");
      if (apm?.setting_value) setActivePaymentMethod(apm.setting_value);
    };
    fetchData();
  }, [user, session, isAdmin, loading]);


  const saveSetting = async (key: string, value: string, isEncrypted = true) => {
    const { error } = await supabase.from("admin_settings").upsert(
      { setting_key: key, setting_value: value, is_encrypted: isEncrypted, updated_by: user?.id },
      { onConflict: "setting_key" }
    );
    if (error) throw error;
  };

  const handleSavePayment = async (provider: string) => {
    setSaving(true);
    try {
      if (provider === "stripe") {
        await saveSetting("stripe_publishable_key", stripe.publishableKey, false);
        await saveSetting("stripe_secret_key", stripe.secretKey);
      } else if (provider === "paypal") {
        await saveSetting("paypal_client_id", paypal.clientId, false);
        await saveSetting("paypal_client_secret", paypal.clientSecret);
        await saveSetting("paypal_sandbox_mode", String(paypal.sandboxMode), false);
      } else {
        await saveSetting("paystack_public_key", paystack.publicKey, false);
        await saveSetting("paystack_secret_key", paystack.secretKey);
      }
      toast.success(
        `${provider === "stripe" ? "Stripe" : provider === "paypal" ? "PayPal" : "Paystack"} credentials saved successfully!`
      );
    } catch (error: any) {
      toast.error("Failed to save: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const toggleSecret = (key: string) => setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSavePlanPricing = async () => {
    setSaving(true);
    try {
      const entries = [
        ["plan_price_growth", planPricing.growth],
        ["plan_price_pro", planPricing.pro],
        ["plan_price_enterprise", planPricing.enterprise],
      ] as const;

      for (const [settingKey, settingValue] of entries) {
        const normalized = Number(settingValue);
        if (!Number.isFinite(normalized) || normalized <= 0) {
          throw new Error(`Invalid value for ${settingKey}. Enter a number greater than 0.`);
        }
        await saveSetting(settingKey, String(normalized), false);
      }

      toast.success("Plan pricing saved successfully.");
    } catch (error: any) {
      toast.error("Failed to save plan pricing: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSupportSettings = async () => {
    setSaving(true);
    try {
      const normalizedSupportEmail = supportContactEmail.trim().toLowerCase();
      const normalizedResendKey = resendApiKey.trim();

      if (!normalizedSupportEmail || !normalizedSupportEmail.includes("@")) {
        throw new Error("Enter a valid support email address.");
      }

      await saveSetting("support_contact_email", normalizedSupportEmail, false);

      if (normalizedResendKey) {
        await saveSetting("resend_api_key", normalizedResendKey, true);
      }

      toast.success("Support email settings saved successfully.");
    } catch (error: any) {
      toast.error("Failed to save support settings: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const issueRenewalCode = async (client: any) => {
    const code = buildAccessCode();
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { error: codeError } = await supabase.from("client_access_codes").insert({
        user_id: client.user_id,
        code,
        plan: client.plan === "—" ? "growth" : client.plan,
        status: "active",
        issued_at: nowIso,
        expires_at: expiresIso,
      });
      if (codeError) throw codeError;

      const { error: subError } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          current_period_start: nowIso,
          current_period_end: expiresIso,
          trial_start: nowIso,
          trial_end: expiresIso,
        })
        .eq("user_id", client.user_id);
      if (subError) throw subError;

      toast.success(`Issued renewal code for ${client.name}: ${code}`);
    } catch (error: any) {
      toast.error("Failed to issue renewal code: " + (error.message || "Unknown error"));
    }
  };

  const handleDeliverableUpload = async (file: File) => {
    if (!user?.id) {
      toast.error("You must be signed in as admin to upload.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Please upload a .zip file.");
      return;
    }

    setUploadingDeliverable(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const filePath = `deliverables/${user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("client-deliverables")
        .upload(filePath, file, { upsert: true, contentType: "application/zip" });
      if (uploadError) throw uploadError;

      // Persist as storage URI so clients can fetch signed links even with private buckets.
      const storageUri = `storage://client-deliverables/${filePath}`;
      await saveSetting("client_deliverable_zip_url", storageUri, false);
      setClientDeliverableZipUrl(storageUri);
      toast.success("Deliverable ZIP uploaded and saved.");
    } catch (error: any) {
      const msg = String(error?.message || "");
      if (/bucket/i.test(msg) && /not found|does not exist/i.test(msg)) {
        toast.error('Storage bucket "client-deliverables" is missing. Create it in Supabase Storage and retry.');
      } else if (/row-level security|not allowed|permission|unauthorized|403/i.test(msg)) {
        toast.error('Upload blocked by storage policy. Allow admin/authenticated INSERT on bucket "client-deliverables".');
      } else {
        toast.error("Failed to upload deliverable ZIP: " + (error.message || "Unknown error"));
      }
    } finally {
      setUploadingDeliverable(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-background">
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
            <Badge variant="secondary" className="ml-2">Admin</Badge>
          </div>
          <div className="flex items-center gap-4">
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
                    You will be logged out of your DataPulseFlow admin dashboard.
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl sm:text-3xl font-serif-display text-foreground mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground mb-8">Manage payment integrations, clients, and demo requests</p>
        </motion.div>

        <Tabs defaultValue="payments" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 sm:grid-cols-7 max-w-5xl">
            <TabsTrigger value="payments"><CreditCard className="w-4 h-4 mr-2 hidden sm:inline" />Payments</TabsTrigger>
            <TabsTrigger value="invoices"><Receipt className="w-4 h-4 mr-2 hidden sm:inline" />Invoices</TabsTrigger>
            <TabsTrigger value="clients"><Users className="w-4 h-4 mr-2 hidden sm:inline" />Clients</TabsTrigger>
            <TabsTrigger value="demos"><FileText className="w-4 h-4 mr-2 hidden sm:inline" />Demos</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="w-4 h-4 mr-2 hidden sm:inline" />Emails</TabsTrigger>
            <TabsTrigger value="branding"><Building2 className="w-4 h-4 mr-2 hidden sm:inline" />Branding</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-2 hidden sm:inline" />Settings</TabsTrigger>
          </TabsList>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Active Payment Method Selector */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">Active Payment Method</CardTitle>
                  <CardDescription>Choose which payment option clients see in their portal</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {["stripe", "paypal", "paystack"].map((method) => (
                      <Button
                        key={method}
                        variant={activePaymentMethod === method ? "default" : "outline"}
                        onClick={async () => {
                          setActivePaymentMethod(method);
                          await supabase.from("admin_settings").upsert(
                            { setting_key: "active_payment_method", setting_value: method, is_encrypted: false, updated_by: user?.id },
                            { onConflict: "setting_key" }
                          );
                          toast.success(`${method.charAt(0).toUpperCase() + method.slice(1)} is now the active payment method for clients`);
                        }}
                      >
                        {method === "stripe" ? <CreditCard className="w-4 h-4 mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                        {method.charAt(0).toUpperCase() + method.slice(1)}
                        {activePaymentMethod === method && <CheckCircle className="w-4 h-4 ml-2" />}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {/* Stripe */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(250,80%,95%)]">
                      <CreditCard className="w-5 h-5 text-[hsl(250,60%,50%)]" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Stripe Integration</CardTitle>
                      <CardDescription>Connect your Stripe account to accept card payments</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Publishable Key</Label>
                    <Input
                      value={stripe.publishableKey}
                      onChange={(e) => setStripe({ ...stripe, publishableKey: e.target.value })}
                      placeholder="pk_live_..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Secret Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecrets.stripeSecret ? "text" : "password"}
                        value={stripe.secretKey}
                        onChange={(e) => setStripe({ ...stripe, secretKey: e.target.value })}
                        placeholder="sk_live_..."
                      />
                      <Button variant="ghost" size="icon" onClick={() => toggleSecret("stripeSecret")}>
                        {showSecrets.stripeSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button onClick={() => handleSavePayment("stripe")} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Stripe Credentials"}
                  </Button>
                </CardContent>
              </Card>

              {/* PayPal */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(205,80%,95%)]">
                      <Shield className="w-5 h-5 text-[hsl(205,70%,45%)]" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">PayPal Integration</CardTitle>
                      <CardDescription>Connect your PayPal Business account for embedded payments</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input
                      value={paypal.clientId}
                      onChange={(e) => setPaypal({ ...paypal, clientId: e.target.value })}
                      placeholder="AW..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Secret</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecrets.paypalSecret ? "text" : "password"}
                        value={paypal.clientSecret}
                        onChange={(e) => setPaypal({ ...paypal, clientSecret: e.target.value })}
                        placeholder="EL..."
                      />
                      <Button variant="ghost" size="icon" onClick={() => toggleSecret("paypalSecret")}>
                        {showSecrets.paypalSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="sandbox"
                      checked={paypal.sandboxMode}
                      onChange={(e) => setPaypal({ ...paypal, sandboxMode: e.target.checked })}
                      className="rounded border-border"
                    />
                    <Label htmlFor="sandbox" className="cursor-pointer">Sandbox Mode (for testing)</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PayPal is configured for one-time guest checkout only. Keep sandbox mode aligned with the client ID/secret environment.
                  </p>
                  <Button onClick={() => handleSavePayment("paypal")} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save PayPal Credentials"}
                  </Button>
                </CardContent>
              </Card>

              {/* Paystack */}
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(145,80%,95%)]">
                      <Shield className="w-5 h-5 text-[hsl(145,70%,35%)]" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Paystack Integration</CardTitle>
                      <CardDescription>Connect your Paystack account for card payments</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Public Key</Label>
                    <Input
                      value={paystack.publicKey}
                      onChange={(e) => setPaystack({ ...paystack, publicKey: e.target.value })}
                      placeholder="pk_live_..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Secret Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecrets.paystackSecret ? "text" : "password"}
                        value={paystack.secretKey}
                        onChange={(e) => setPaystack({ ...paystack, secretKey: e.target.value })}
                        placeholder="sk_live_..."
                      />
                      <Button variant="ghost" size="icon" onClick={() => toggleSecret("paystackSecret")}>
                        {showSecrets.paystackSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button onClick={() => handleSavePayment("paystack")} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Paystack Credentials"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-xl">Plan Pricing</CardTitle>
                  <CardDescription>
                    Update client-visible plan amounts used by PayPal and Paystack checkout flows.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Growth (USD)</Label>
                      <Input
                        type="number"
                        min="1"
                        step="0.01"
                        value={planPricing.growth}
                        onChange={(e) => setPlanPricing(prev => ({ ...prev, growth: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pro (USD)</Label>
                      <Input
                        type="number"
                        min="1"
                        step="0.01"
                        value={planPricing.pro}
                        onChange={(e) => setPlanPricing(prev => ({ ...prev, pro: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Enterprise (USD)</Label>
                      <Input
                        type="number"
                        min="1"
                        step="0.01"
                        value={planPricing.enterprise}
                        onChange={(e) => setPlanPricing(prev => ({ ...prev, enterprise: e.target.value }))}
                      />
                    </div>
                  </div>
                  <Button onClick={handleSavePlanPricing} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Plan Pricing"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-xl">Client Deliverable ZIP</CardTitle>
                  <CardDescription>
                    Configure the ZIP file URL delivered to clients after payment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="deliverable-zip-upload">Upload ZIP file</Label>
                    <Input
                      id="deliverable-zip-upload"
                      type="file"
                      accept=".zip,application/zip,application/x-zip-compressed"
                      disabled={uploadingDeliverable}
                      onChange={async (e) => {
                        const inputEl = e.currentTarget;
                        const file = e.target.files?.[0];
                        if (file) await handleDeliverableUpload(file);
                        if (inputEl) inputEl.value = "";
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Uploads to Supabase Storage bucket <span className="font-mono">client-deliverables</span>.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Deliverable ZIP URL</Label>
                    <Input
                      value={clientDeliverableZipUrl}
                      onChange={(e) => setClientDeliverableZipUrl(e.target.value)}
                      placeholder="https://datapulseflow.com/deliverables/client-deliverable.zip"
                    />
                  </div>
                  <Button
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await saveSetting(
                          "client_deliverable_zip_url",
                          clientDeliverableZipUrl.trim(),
                          false
                        );
                        toast.success("Client deliverable ZIP URL saved.");
                      } catch (error: any) {
                        toast.error("Failed to save deliverable URL: " + (error.message || "Unknown error"));
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving || uploadingDeliverable}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Deliverable URL"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients">
            <Card>
              <CardHeader>
                <CardTitle>Active Clients</CardTitle>
                <CardDescription>Manage subscriptions and client accounts</CardDescription>
              </CardHeader>
              <CardContent>
                {clients.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No clients yet</p>
                ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground font-medium">Name</th>
                        <th className="text-left py-2 text-muted-foreground font-medium hidden sm:table-cell">Email</th>
                        <th className="text-left py-2 text-muted-foreground font-medium">Plan</th>
                        <th className="text-left py-2 text-muted-foreground font-medium">Status</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((client: any) => (
                        <tr key={client.id} className="border-b border-border/50">
                          <td className="py-3 text-foreground font-medium">{client.name}</td>
                          <td className="py-3 text-muted-foreground hidden sm:table-cell">{client.email}</td>
                          <td className="py-3"><Badge variant="secondary">{client.plan}</Badge></td>
                          <td className="py-3">
                            <Badge variant={client.status === "active" ? "default" : "secondary"}>
                              {client.status === "active" && <CheckCircle className="w-3 h-3 mr-1" />}
                              {client.status === "trialing" && <Clock className="w-3 h-3 mr-1" />}
                              {client.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <Button size="sm" variant="outline" onClick={() => issueRenewalCode(client)}>
                              Issue 30-Day Code
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
          </TabsContent>

          {/* Demo Requests Tab */}
          <TabsContent value="demos">
            <Card>
              <CardHeader>
                <CardTitle>Demo Requests</CardTitle>
                <CardDescription>Approve or reject incoming demo requests. Users cannot access the platform until approved.</CardDescription>
              </CardHeader>
              <CardContent>
                {demoRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No demo requests yet</p>
                ) : (
                  <div className="space-y-3">
                    {demoRequests.map((req: any) => (
                      <div key={req.id} className="p-4 rounded-lg border border-border">
                        <div className="flex flex-col sm:flex-row justify-between gap-2 mb-2">
                          <div>
                            <p className="font-medium text-foreground">{req.full_name}</p>
                            <p className="text-sm text-muted-foreground">{req.email}</p>
                          </div>
                          <Badge variant={req.approved ? "default" : req.status === "rejected" ? "destructive" : "secondary"}>
                            {req.approved ? "Approved" : req.status === "rejected" ? "Rejected" : "Pending"}
                          </Badge>
                        </div>
                        {req.company_name && <p className="text-sm text-muted-foreground">Company: {req.company_name}</p>}
                        {req.message && <p className="text-sm text-muted-foreground mt-1">{req.message}</p>}
                        <p className="text-xs text-muted-foreground mt-2">{new Date(req.created_at).toLocaleString()}</p>
                        {!req.approved && req.status !== "rejected" && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("demo_requests")
                                  .update({ approved: true, status: "approved" })
                                  .eq("id", req.id);
                                if (error) {
                                  toast.error("Failed to approve");
                                } else {
                                  toast.success(`Approved ${req.full_name}`);
                                  setDemoRequests(prev =>
                                    prev.map(r => r.id === req.id ? { ...r, approved: true, status: "approved" } : r)
                                  );
                                  // Send approval email
                                  const email = demoApprovedEmail({
                                    name: req.full_name,
                                    loginUrl: `${window.location.origin}/login`,
                                  });
                                  sendNotifyEmail({ to: req.email, ...email, templateName: "demo-approved" }).catch(() => {});
                                }
                              }}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("demo_requests")
                                  .update({ approved: false, status: "rejected" })
                                  .eq("id", req.id);
                                if (error) {
                                  toast.error("Failed to reject");
                                } else {
                                  toast.success(`Rejected ${req.full_name}`);
                                  setDemoRequests(prev =>
                                    prev.map(r => r.id === req.id ? { ...r, status: "rejected" } : r)
                                  );
                                  // Send rejection email
                                  const email = demoRejectedEmail({ name: req.full_name });
                                  sendNotifyEmail({ to: req.email, ...email, templateName: "demo-rejected" }).catch(() => {});
                                }
                              }}
                            >
                              <AlertTriangle className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices">
            <InvoiceManager />
          </TabsContent>

          {/* Emails Tab */}
          <TabsContent value="emails">
            <EmailLogView />
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding">
            <BrandingSettings userId={user?.id || ""} />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Platform Settings</CardTitle>
                <CardDescription>Configure your DataPulseFlow platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-medium text-foreground mb-1">Integration Status</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${stripe.publishableKey ? "bg-green-500" : "bg-muted-foreground"}`} />
                        <span className="text-sm text-muted-foreground">Stripe: {stripe.publishableKey ? "Connected" : "Not configured"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${paypal.clientId ? "bg-green-500" : "bg-muted-foreground"}`} />
                        <span className="text-sm text-muted-foreground">PayPal: {paypal.clientId ? "Connected" : "Not configured"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${paystack.secretKey ? "bg-green-500" : "bg-muted-foreground"}`} />
                        <span className="text-sm text-muted-foreground">Paystack: {paystack.secretKey ? "Connected" : "Not configured"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <h3 className="font-medium text-foreground mb-1">Support Chat Email Setup</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Configure where floating chat messages are delivered and optionally store your Resend API key fallback.
                    </p>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Support inbox email</Label>
                        <Input
                          type="email"
                          value={supportContactEmail}
                          onChange={(e) => setSupportContactEmail(e.target.value)}
                          placeholder="support@yourdomain.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Resend API key (fallback)</Label>
                        <div className="flex gap-2">
                          <Input
                            type={showSecrets.resendApi ? "text" : "password"}
                            value={resendApiKey}
                            onChange={(e) => setResendApiKey(e.target.value)}
                            placeholder="re_..."
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => toggleSecret("resendApi")}>
                            {showSecrets.resendApi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      <Button type="button" onClick={handleSaveSupportSettings} disabled={saving}>
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? "Saving..." : "Save Support Email Settings"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
