// Branded HTML email templates for DataPulseFlow
// Colors from design system: primary hsl(215, 60%, 18%) = #172a4a, accent hsl(205, 70%, 88%) = #bdddf0

const BRAND = {
  name: "DataPulseFlow",
  primary: "#172a4a",
  primaryLight: "#1e3a5f",
  accent: "#bdddf0",
  accentDark: "#6bb3d9",
  foreground: "#111827",
  muted: "#6b7280",
  background: "#f8fafc",
  white: "#ffffff",
  border: "#e2e8f0",
  radius: "12px",
  font: "'Inter Tight', 'Helvetica Neue', Arial, sans-serif",
};

const layout = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.background};font-family:${BRAND.font};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.background};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.white};border-radius:${BRAND.radius};overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND.primary};padding:28px 32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="width:32px;height:32px;background-color:rgba(255,255,255,0.15);border-radius:8px;text-align:center;vertical-align:middle;">
                    <span style="color:${BRAND.white};font-size:16px;font-weight:800;">D</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="color:${BRAND.white};font-size:20px;font-weight:700;letter-spacing:-0.3px;">${BRAND.name}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:36px 32px 28px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};text-align:center;line-height:1.6;">
                © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.<br/>
                <a href="https://datapulseflow.com" style="color:${BRAND.accentDark};text-decoration:none;">datapulseflow.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const button = (text: string, url: string) => `
<table cellpadding="0" cellspacing="0" style="margin:28px 0;">
  <tr>
    <td style="background-color:${BRAND.primary};border-radius:8px;padding:14px 28px;">
      <a href="${url}" style="color:${BRAND.white};font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">${text}</a>
    </td>
  </tr>
</table>`;

// ── Templates ──

export function welcomeEmail(data: { name: string; loginUrl: string }) {
  return {
    subject: `Welcome to ${BRAND.name}, ${data.name}!`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.foreground};">Welcome aboard, ${data.name}! 🚀</h1>
      <p style="margin:0 0 12px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        Your ${BRAND.name} account is ready. You're starting with a <strong style="color:${BRAND.foreground};">7-day free trial</strong> with full platform access.
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND.muted};line-height:1.6;">Here's what you can do:</p>
      <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;color:${BRAND.muted};line-height:2;">
        <li>Connect your Shopify store with secure webhooks</li>
        <li>Sync real-time product, order, and customer data</li>
        <li>Monitor everything from your dashboard</li>
      </ul>
      ${button("Go to Dashboard", data.loginUrl)}
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">Need help? Reply to this email — we're here for you.</p>
    `),
  };
}

export function demoApprovedEmail(data: { name: string; loginUrl: string }) {
  return {
    subject: `Your ${BRAND.name} demo has been approved!`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.foreground};">Great news, ${data.name}! ✅</h1>
      <p style="margin:0 0 12px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        Your demo request has been <strong style="color:#059669;">approved</strong>. You now have full access to ${BRAND.name}.
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        Log in to explore the platform and start integrating your data flows.
      </p>
      ${button("Access Your Account", data.loginUrl)}
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">Questions? Just reply to this email.</p>
    `),
  };
}

export function demoRejectedEmail(data: { name: string }) {
  return {
    subject: `Update on your ${BRAND.name} demo request`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.foreground};">Hi ${data.name},</h1>
      <p style="margin:0 0 12px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        Thank you for your interest in ${BRAND.name}. After reviewing your request, we're unable to approve your demo at this time.
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        If you believe this was a mistake or have additional context to share, please reply to this email and we'll take another look.
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:${BRAND.muted};">— The ${BRAND.name} Team</p>
    `),
  };
}

export function invoiceEmail(data: {
  clientName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  invoiceUrl: string;
}) {
  return {
    subject: `Invoice #${data.invoiceNumber} from ${BRAND.name}`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.foreground};">New Invoice</h1>
      <p style="margin:0 0 20px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        Hi ${data.clientName}, here's your latest invoice from ${BRAND.name}.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.background};border-radius:8px;padding:20px;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 16px;">
            <span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.5px;">Invoice #</span><br/>
            <span style="font-size:16px;font-weight:600;color:${BRAND.foreground};">${data.invoiceNumber}</span>
          </td>
          <td style="padding:8px 16px;text-align:right;">
            <span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.5px;">Amount</span><br/>
            <span style="font-size:20px;font-weight:700;color:${BRAND.primary};">${data.amount}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:8px 16px;">
            <span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.5px;">Due Date</span><br/>
            <span style="font-size:14px;font-weight:500;color:${BRAND.foreground};">${data.dueDate}</span>
          </td>
        </tr>
      </table>
      ${button("View Invoice", data.invoiceUrl)}
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">If you have any questions about this invoice, reply to this email.</p>
    `),
  };
}

export function trialExpiringEmail(data: { name: string; daysLeft: number; upgradeUrl: string }) {
  return {
    subject: `Your ${BRAND.name} trial ends in ${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"}`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.foreground};">
        ${data.daysLeft <= 1 ? "Last chance" : `${data.daysLeft} days left`}, ${data.name}! ⏳
      </h1>
      <p style="margin:0 0 12px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        Your free trial of ${BRAND.name} ${data.daysLeft <= 1 ? "expires tomorrow" : `ends in ${data.daysLeft} days`}.
        Upgrade now to keep your integrations running without interruption.
      </p>
      <div style="background-color:${BRAND.background};border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:${BRAND.foreground};font-weight:600;">What happens if you don't upgrade?</p>
        <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:${BRAND.muted};line-height:1.8;">
          <li>Data syncs will pause</li>
          <li>Webhook connections will be disabled</li>
          <li>Your data is safe — you can upgrade anytime to resume</li>
        </ul>
      </div>
      ${button("Upgrade Now", data.upgradeUrl)}
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">Need more time? Reply and let us know.</p>
    `),
  };
}

export function invoiceOverdueEmail(data: {
  clientName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  invoiceUrl: string;
}) {
  return {
    subject: `Overdue: Invoice #${data.invoiceNumber} from ${BRAND.name}`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#dc2626;">Payment Overdue</h1>
      <p style="margin:0 0 20px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        Hi ${data.clientName}, invoice <strong>#${data.invoiceNumber}</strong> was due on <strong>${data.dueDate}</strong> and remains unpaid.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 16px;">
            <span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Amount Due</span><br/>
            <span style="font-size:20px;font-weight:700;color:#dc2626;">${data.amount}</span>
          </td>
          <td style="padding:8px 16px;text-align:right;">
            <span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Due Date</span><br/>
            <span style="font-size:14px;font-weight:500;color:#dc2626;">${data.dueDate}</span>
          </td>
        </tr>
      </table>
      ${button("Pay Now", data.invoiceUrl)}
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">Already paid? Please disregard this notice or reply for assistance.</p>
    `),
  };
}
