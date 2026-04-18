import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveRealEstateLoginDestination } from "@/lib/auth-redirects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const RealEstateLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const signInResult = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Login timed out. Please try again.")), 12000)
        ),
      ]);

      const { data, error } = signInResult;
      if (error) throw error;

      if (data.user) {
        await supabase.auth.getSession();
        const [rolesRes, reRes] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", data.user.id),
          supabase.from("realestate_user_profile").select("user_id").eq("user_id", data.user.id).maybeSingle(),
        ]);
        const isAdminUser = rolesRes.data?.some((r) => r.role === "admin") ?? false;
        const isRealEstateUser = !!reRes.data;
        const dest = resolveRealEstateLoginDestination({
          nextParam: searchParams.get("next"),
          isRealEstateUser,
          isAdmin: isAdminUser,
        });
        navigate(dest);
      }
    } catch (error: any) {
      toast.error(error.message || "Login failed");
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
          <CardTitle className="text-2xl text-left">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="re-email">Email</Label>
              <Input
                id="re-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
                className="border-emerald-800/25 focus-visible:ring-emerald-700"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="re-password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-emerald-800 dark:text-emerald-300 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="re-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="border-emerald-800/25 focus-visible:ring-emerald-700"
              />
            </div>
            <Button type="submit" className="w-full bg-emerald-800 hover:bg-emerald-900 text-white" size="lg" disabled={loading}>
              {loading ? "Signing in…" : "Sign in to Real Estate"}
            </Button>
            <p className="text-left text-sm text-muted-foreground">
              Need an account?{" "}
              <Link to="/real-estate/register" className="text-emerald-800 dark:text-emerald-300 font-medium hover:underline">
                Create Real Estate access
              </Link>
            </p>
            <p className="text-left text-xs text-muted-foreground border-t border-border/60 pt-3">
              Looking for the Shopify data product?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Shopify portal login
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealEstateLogin;
