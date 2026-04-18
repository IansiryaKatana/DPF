import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sendHelloEmail } from "@/lib/send-email";
import { welcomeEmail } from "@/lib/email-templates";
import { isEmailScenarioEnabled } from "@/lib/email-scenarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const RealEstateRegister = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    companyName: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.fullName,
            company_name: form.companyName,
            signup_product: "realestate",
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      await supabase.from("demo_requests").insert({
        full_name: form.fullName,
        email: form.email,
        company_name: form.companyName,
        message: "Registered via Real Estate suite signup",
        product_suite: "realestate",
      });

      if (signUpData.session && (await isEmailScenarioEnabled("welcome"))) {
        const email = welcomeEmail({
          name: form.fullName,
          loginUrl: `${window.location.origin}/real-estate/login`,
        });
        await sendHelloEmail({ to: form.email, ...email, templateName: "welcome" }).catch(() => {});
      }

      toast.success("Account created! Check your email if verification is required.");
      navigate("/real-estate/login?next=/real-estate/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-emerald-950/35 via-background to-background">
      <Card className="w-full max-w-md border-emerald-800/40 shadow-lg shadow-emerald-950/10">
        <CardHeader className="text-left space-y-3">
          <div className="flex flex-col items-start gap-1">
            <span className="text-lg font-serif-display text-foreground">DataPulseFlow</span>
            <Badge variant="outline" className="border-emerald-700/50 text-emerald-800 dark:text-emerald-200 text-[10px] uppercase tracking-wide">
              Real Estate Suite
            </Badge>
          </div>
          <CardTitle className="text-2xl text-left">Create Real Estate access</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="re-reg-fullName">Full name</Label>
              <Input
                id="re-reg-fullName"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Jane Doe"
                className="border-emerald-800/25 focus-visible:ring-emerald-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="re-reg-email">Email</Label>
              <Input
                id="re-reg-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@agency.com"
                className="border-emerald-800/25 focus-visible:ring-emerald-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="re-reg-company">Company / brokerage</Label>
              <Input
                id="re-reg-company"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="Optional"
                className="border-emerald-800/25 focus-visible:ring-emerald-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="re-reg-password">Password</Label>
              <Input
                id="re-reg-password"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="border-emerald-800/25 focus-visible:ring-emerald-700"
              />
            </div>
            <Button type="submit" className="w-full bg-emerald-800 hover:bg-emerald-900 text-white" size="lg" disabled={loading}>
              {loading ? "Creating account…" : "Create Real Estate account"}
            </Button>
            <p className="text-left text-sm text-muted-foreground">
              Already registered?{" "}
              <Link to="/real-estate/login" className="text-emerald-800 dark:text-emerald-300 font-medium hover:underline">
                Sign in
              </Link>
            </p>
            <p className="text-left text-xs text-muted-foreground border-t border-border/60 pt-3">
              Need the Shopify data product instead?{" "}
              <Link to="/register" className="text-primary hover:underline">
                Shopify trial signup
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealEstateRegister;
