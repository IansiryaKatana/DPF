import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Building2 } from "lucide-react";

const BRANDING_KEYS = [
  { key: "company_name", label: "Company Name", placeholder: "DataPulseFlow", type: "input" },
  { key: "company_email", label: "Company Email", placeholder: "billing@datapulseflow.com", type: "input" },
  { key: "company_phone", label: "Company Phone", placeholder: "+1 (555) 000-0000", type: "input" },
  { key: "company_website", label: "Company Website", placeholder: "https://datapulseflow.com", type: "input" },
  { key: "company_address", label: "Company Address", placeholder: "123 Data Street\nSan Francisco, CA 94102", type: "textarea" },
] as const;

interface Props {
  userId: string;
}

const BrandingSettings = ({ userId }: Props) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchBranding = async () => {
      const { data } = await supabase
        .from("admin_settings")
        .select("*")
        .in("setting_key", BRANDING_KEYS.map(b => b.key));
      if (data) {
        const v: Record<string, string> = {};
        data.forEach((s: any) => { v[s.setting_key] = s.setting_value || ""; });
        setValues(v);
      }
    };
    fetchBranding();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const { key } of BRANDING_KEYS) {
        await supabase.from("admin_settings").upsert(
          { setting_key: key, setting_value: values[key] || "", is_encrypted: false, updated_by: userId },
          { onConflict: "setting_key" }
        );
      }
      toast.success("Company branding saved!");
    } catch (error: any) {
      toast.error("Failed to save: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/50">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">Company Branding</CardTitle>
            <CardDescription>These details appear on all client invoices and receipts</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {BRANDING_KEYS.map(({ key, label, placeholder, type }) => (
          <div key={key} className="space-y-2">
            <Label>{label}</Label>
            {type === "textarea" ? (
              <Textarea
                value={values[key] || ""}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                placeholder={placeholder}
                rows={3}
              />
            ) : (
              <Input
                value={values[key] || ""}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                placeholder={placeholder}
              />
            )}
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Branding"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default BrandingSettings;
