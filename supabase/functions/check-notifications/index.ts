import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BRAND = {
  name: "DataPulseFlow",
  primary: "#172a4a",
  white: "#ffffff",
  muted: "#6b7280",
  foreground: "#111827",
  background: "#f8fafc",
  border: "#e2e8f0",
  accentDark: "#6bb3d9",
};

function trialExpiringHtml(name: string, daysLeft: number, upgradeUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:${BRAND.background};font-family:'Inter Tight','Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.background};padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.white};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background-color:${BRAND.primary};padding:28px 32px;text-align:center;">
<span style="color:${BRAND.white};font-size:20px;font-weight:700;">DataPulseFlow</span>
</td></tr>
<tr><td style="padding:36px 32px 28px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.foreground};">${daysLeft <= 1 ? "Last chance" : `${daysLeft} days left`}, ${name}! ⏳</h1>
<p style="margin:0 0 12px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
Your free trial of DataPulseFlow ${daysLeft <= 1 ? "expires tomorrow" : `ends in ${daysLeft} days`}. Upgrade now to keep your integrations running.
</p>
<div style="background-color:${BRAND.background};border-radius:8px;padding:16px 20px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:${BRAND.foreground};font-weight:600;">What happens if you don't upgrade?</p>
<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:${BRAND.muted};line-height:1.8;">
<li>Data syncs will pause</li>
<li>Webhook connections will be disabled</li>
<li>Your data is safe — upgrade anytime to resume</li>
</ul>
</div>
<table cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td style="background-color:${BRAND.primary};border-radius:8px;padding:14px 28px;">
<a href="${upgradeUrl}" style="color:${BRAND.white};font-size:14px;font-weight:600;text-decoration:none;">Upgrade Now</a>
</td></tr>
</table>
<p style="margin:0;font-size:13px;color:${BRAND.muted};">Need more time? Reply and let us know.</p>
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:12px;color:${BRAND.muted};text-align:center;">© ${new Date().getFullYear()} DataPulseFlow. All rights reserved.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function overdueInvoiceHtml(clientName: string, invoiceNumber: string, amount: string, dueDate: string, invoiceUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:${BRAND.background};font-family:'Inter Tight','Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.background};padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.white};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background-color:${BRAND.primary};padding:28px 32px;text-align:center;">
<span style="color:${BRAND.white};font-size:20px;font-weight:700;">DataPulseFlow</span>
</td></tr>
<tr><td style="padding:36px 32px 28px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#dc2626;">Payment Overdue</h1>
<p style="margin:0 0 20px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
Hi ${clientName}, invoice <strong>#${invoiceNumber}</strong> was due on <strong>${dueDate}</strong> and remains unpaid.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:24px;">
<tr>
<td style="padding:8px 16px;"><span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Amount Due</span><br/><span style="font-size:20px;font-weight:700;color:#dc2626;">${amount}</span></td>
<td style="padding:8px 16px;text-align:right;"><span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Due Date</span><br/><span style="font-size:14px;font-weight:500;color:#dc2626;">${dueDate}</span></td>
</tr>
</table>
<table cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td style="background-color:${BRAND.primary};border-radius:8px;padding:14px 28px;">
<a href="${invoiceUrl}" style="color:${BRAND.white};font-size:14px;font-weight:600;text-decoration:none;">Pay Now</a>
</td></tr>
</table>
<p style="margin:0;font-size:13px;color:${BRAND.muted};">Already paid? Please disregard this notice.</p>
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:12px;color:${BRAND.muted};text-align:center;">© ${new Date().getFullYear()} DataPulseFlow. All rights reserved.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const siteUrl = req.headers.get('x-site-url') || 'https://datapulseflow.com';
    const results: string[] = [];

    // 1. Trial expiration emails (3 days, 1 day before)
    for (const daysLeft of [3, 1]) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysLeft);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: expiring } = await supabase
        .from('subscriptions')
        .select('user_id, trial_end')
        .eq('status', 'trialing')
        .gte('trial_end', startOfDay.toISOString())
        .lte('trial_end', endOfDay.toISOString());

      if (expiring && expiring.length > 0) {
        for (const sub of expiring) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('user_id', sub.user_id)
            .maybeSingle();

          if (profile?.email) {
            const html = trialExpiringHtml(
              profile.full_name || 'there',
              daysLeft,
              `${siteUrl}/dashboard`
            );

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'DataPulseFlow <notify@datapulseflow.com>',
                to: [profile.email],
                subject: `Your DataPulseFlow trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
                html,
              }),
            });
            results.push(`trial-${daysLeft}d: ${profile.email}`);
          }
        }
      }
    }

    // 2. Overdue invoice notifications
    const { data: overdueInvoices } = await supabase
      .from('invoices')
      .select('id, user_id, amount, currency, due_date')
      .eq('status', 'overdue');

    if (overdueInvoices && overdueInvoices.length > 0) {
      // Mark overdue
      await supabase.rpc('mark_overdue_invoices');

      for (const inv of overdueInvoices) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('user_id', inv.user_id)
          .maybeSingle();

        if (profile?.email) {
          const dueDate = inv.due_date
            ? new Date(inv.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : 'N/A';

          const html = overdueInvoiceHtml(
            profile.full_name || 'Valued Client',
            inv.id.slice(0, 8).toUpperCase(),
            `${inv.currency.toUpperCase()} ${Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            dueDate,
            `${siteUrl}/invoice/${inv.id}`
          );

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'DataPulseFlow <notify@datapulseflow.com>',
              to: [profile.email],
              subject: `Overdue: Invoice #${inv.id.slice(0, 8).toUpperCase()} from DataPulseFlow`,
              html,
            }),
          });
          results.push(`overdue: ${profile.email}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Check notifications error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
