import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendNotifyEmail } from "@/lib/send-email";
import { isEmailScenarioEnabled } from "@/lib/email-scenarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_SUPPORT_EMAIL = "support@datapulseflow.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const SupportChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [supportEmail, setSupportEmail] = useState(DEFAULT_SUPPORT_EMAIL);

  useEffect(() => {
    const loadSupportAddress = async () => {
      const { data } = await supabase
        .from("admin_settings")
        .select("setting_value")
        .eq("setting_key", "support_contact_email")
        .maybeSingle();

      if (data?.setting_value?.trim()) {
        setSupportEmail(data.setting_value.trim());
      }
    };

    loadSupportAddress();
  }, []);

  useEffect(() => {
    const handleOpenSupportChat = () => {
      setSent(false);
      setIsOpen(true);
    };

    window.addEventListener("support-chat:open", handleOpenSupportChat);
    return () => window.removeEventListener("support-chat:open", handleOpenSupportChat);
  }, []);

  const resetForm = () => {
    setQuestion("");
    setSent(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!EMAIL_PATTERN.test(email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (!question.trim()) {
      toast.error("Please enter your question.");
      return;
    }

    setLoading(true);
    try {
      if (!(await isEmailScenarioEnabled("support_chat_submission"))) {
        toast.info("Support email is temporarily paused. Please try again later.");
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanQuestion = question.trim();
      const timestamp = new Date().toISOString();
      const safeQuestion = escapeHtml(cleanQuestion).replace(/\n/g, "<br />");

      await sendNotifyEmail({
        to: supportEmail,
        subject: `Website support chat from ${cleanEmail}`,
        replyTo: cleanEmail,
        templateName: "support-chat-widget",
        metadata: {
          source: "floating-support-widget",
          userEmail: cleanEmail,
          sentAt: timestamp,
          userAgent: navigator.userAgent,
          pageUrl: window.location.href,
        },
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
            <h2 style="margin:0 0 12px;">New support message from website chat widget</h2>
            <p style="margin:0 0 6px;"><strong>Customer email:</strong> ${escapeHtml(cleanEmail)}</p>
            <p style="margin:0 0 6px;"><strong>Submitted at:</strong> ${escapeHtml(timestamp)}</p>
            <p style="margin:0 0 6px;"><strong>Page:</strong> ${escapeHtml(window.location.href)}</p>
            <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
            <p style="margin:0 0 6px;"><strong>Message:</strong></p>
            <div style="padding:12px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;">${safeQuestion}</div>
          </div>
        `,
      });

      setSent(true);
      setQuestion("");
      toast.success("Message sent. We will reply to your email.");
    } catch (error) {
      console.error("Support email send failed:", error);
      toast.error("Unable to send right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            resetForm();
          }
          setIsOpen((open) => !open);
        }}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
        aria-label={isOpen ? "Close support chat" : "Open support chat"}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {isOpen && (
        <section className="fixed bottom-0 right-0 z-50 w-full border border-border bg-background shadow-2xl sm:bottom-24 sm:right-5 sm:max-w-[380px] sm:rounded-2xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-lg font-semibold text-foreground">Help</p>
              <p className="text-xs text-muted-foreground">Ask a question and we will reply by email.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Close help chat">
              <X className="h-5 w-5" />
            </Button>
          </header>

          <div className="max-h-[65vh] overflow-y-auto px-4 py-4">
            {sent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5" />
                  Message sent successfully
                </div>
                <p>
                  Our admin team will continue via email at <strong>{email}</strong>.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    setSent(false);
                    setQuestion("");
                  }}
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground">
                Hi there. Share your account email and question, then we will route it directly to support.
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 border-t border-border px-4 py-4">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading || sent}
            />
            <Textarea
              placeholder="Ask your question..."
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="min-h-[90px]"
              required
              disabled={loading || sent}
            />
            <Button type="submit" className="w-full" disabled={loading || sent}>
              {loading ? "Sending..." : "Send message"}
              {!loading && <Send className="ml-2 h-4 w-4" />}
            </Button>
          </form>
        </section>
      )}
    </>
  );
};

export default SupportChatWidget;
