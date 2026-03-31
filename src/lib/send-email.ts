import { supabase } from "@/integrations/supabase/client";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  templateName?: string;
  metadata?: Record<string, unknown>;
}

export async function sendEmail(params: SendEmailParams) {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: params,
  });

  if (error) {
    console.error("Failed to send email:", error);
    throw error;
  }

  return data;
}

export async function sendNotifyEmail(params: Omit<SendEmailParams, "from">) {
  return sendEmail({ ...params, from: "DataPulseFlow <notify@datapulseflow.com>" });
}

export async function sendHelloEmail(params: Omit<SendEmailParams, "from">) {
  return sendEmail({ ...params, from: "DataPulseFlow <hello@datapulseflow.com>" });
}
