import { supabase } from "@/integrations/supabase/client";

export type EmailScenarioKey =
  | "welcome"
  | "demo_approved"
  | "demo_rejected"
  | "invoice_created"
  | "support_chat_submission";

export interface EmailScenarioDefinition {
  key: EmailScenarioKey;
  label: string;
  description: string;
  templateName: string;
}

export const EMAIL_SCENARIOS: EmailScenarioDefinition[] = [
  {
    key: "welcome",
    label: "Welcome Email",
    description: "Sent when a new user account is created.",
    templateName: "welcome",
  },
  {
    key: "demo_approved",
    label: "Demo Approved",
    description: "Sent after admin approves a demo request.",
    templateName: "demo-approved",
  },
  {
    key: "demo_rejected",
    label: "Demo Rejected",
    description: "Sent after admin rejects a demo request.",
    templateName: "demo-rejected",
  },
  {
    key: "invoice_created",
    label: "Invoice Created",
    description: "Sent when a new invoice is created for a client.",
    templateName: "invoice-created",
  },
  {
    key: "support_chat_submission",
    label: "Support Chat Submission",
    description: "Sent to support inbox when a website visitor submits the floating chat form.",
    templateName: "support-chat-widget",
  },
];

export const emailScenarioSettingKey = (key: EmailScenarioKey) => `email_toggle_${key}`;

const toBool = (value?: string | null) => {
  if (value == null) return true;
  return value.toLowerCase() !== "false";
};

export async function isEmailScenarioEnabled(key: EmailScenarioKey) {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("setting_value")
    .eq("setting_key", emailScenarioSettingKey(key))
    .maybeSingle();

  if (error) {
    console.error(`Failed to load email scenario toggle for ${key}:`, error);
    return true;
  }

  return toBool(data?.setting_value);
}

