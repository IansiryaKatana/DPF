import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";

interface BrandingSettings {
  company_name: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_website: string;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

const RealEstateInvoiceView = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<any>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [branding, setBranding] = useState<BrandingSettings>({
    company_name: "DataPulseFlow",
    company_email: "",
    company_phone: "",
    company_address: "",
    company_website: "",
  });
  const [clientProfile, setClientProfile] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate("/real-estate/login");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user || !id) return;

    const fetchData = async () => {
      const [invoiceRes, settingsRes] = await Promise.all([
        supabase.from("realestate_invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("admin_settings").select("*").in("setting_key", [
          "company_name", "company_email", "company_phone", "company_address", "company_website"
        ]),
      ]);

      if (invoiceRes.data) {
        const inv = invoiceRes.data;
        // Client-side overdue detection
        if (inv.status === "pending" && inv.due_date && new Date(inv.due_date) < new Date()) {
          inv.status = "overdue";
        }
        setInvoice(inv);
        const uid = invoiceRes.data.user_id;
        const [{ data: prof }, { data: reProf }] = await Promise.all([
          supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
          supabase.from("realestate_user_profile").select("full_name, company_name").eq("user_id", uid).maybeSingle(),
        ]);
        setClientProfile({
          ...prof,
          full_name: reProf?.full_name ?? prof?.full_name ?? null,
          company_name: reProf?.company_name ?? prof?.company_name ?? null,
          email: prof?.email ?? null,
        });
      }

      setLineItems([]);

      if (settingsRes.data) {
        const b: any = { ...branding };
        settingsRes.data.forEach((s: any) => {
          if (s.setting_key in b) b[s.setting_key] = s.setting_value || "";
        });
        setBranding(b);
      }

      setLoadingData(false);
    };
    fetchData();
  }, [user, id]);

  const formatAmount = (amt: number) =>
    Number(amt).toLocaleString("en-US", { minimumFractionDigits: 2 });

  const totalAmount = lineItems.length > 0
    ? lineItems.reduce((sum, it) => sum + Number(it.amount), 0)
    : Number(invoice?.amount || 0);

  const handleDownloadPDF = () => {
    if (!invoice) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 25;

    // Company name
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(branding.company_name || "DataPulseFlow", margin, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    if (branding.company_address) {
      branding.company_address.split("\n").forEach(line => { doc.text(line, margin, y); y += 4.5; });
    }
    if (branding.company_email) { doc.text(branding.company_email, margin, y); y += 4.5; }
    if (branding.company_phone) { doc.text(branding.company_phone, margin, y); y += 4.5; }
    if (branding.company_website) { doc.text(branding.company_website, margin, y); y += 4.5; }

    // Invoice title
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 64, 120);
    doc.text("INVOICE", pageWidth - margin, 30, { align: "right" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Invoice #: ${invoice.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, 40, { align: "right" });
    doc.text(`Date: ${format(new Date(invoice.invoice_date), "MMMM d, yyyy")}`, pageWidth - margin, 45, { align: "right" });
    if (invoice.due_date) {
      doc.text(`Due: ${format(new Date(invoice.due_date), "MMMM d, yyyy")}`, pageWidth - margin, 50, { align: "right" });
    }

    const statusLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    if (invoice.status === "paid") doc.setTextColor(22, 163, 74);
    else if (invoice.status === "overdue") doc.setTextColor(220, 38, 38);
    else doc.setTextColor(202, 138, 4);
    doc.text(statusLabel, pageWidth - margin, 57, { align: "right" });

    // Bill To
    y = Math.max(y, 65) + 10;
    doc.setFillColor(245, 245, 248);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 25, 3, 3, "F");
    y += 7;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("BILL TO", margin + 5, y);
    y += 5;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(clientProfile?.full_name || "—", margin + 5, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    if (clientProfile?.company_name) { doc.text(clientProfile.company_name, margin + 5, y); y += 4.5; }
    doc.text(clientProfile?.email || "—", margin + 5, y);

    // Line items table
    y += 20;
    const colDesc = margin + 5;
    const colQty = pageWidth - margin - 80;
    const colPrice = pageWidth - margin - 45;
    const colAmt = pageWidth - margin - 5;

    doc.setFillColor(30, 64, 120);
    doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Description", colDesc, y + 5.5);
    doc.text("Qty", colQty, y + 5.5, { align: "right" });
    doc.text("Price", colPrice, y + 5.5, { align: "right" });
    doc.text("Amount", colAmt, y + 5.5, { align: "right" });
    y += 8;

    const items = lineItems.length > 0
      ? lineItems
      : [{ description: invoice.description || "Service charge", quantity: 1, unit_price: Number(invoice.amount), amount: Number(invoice.amount) }];

    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    items.forEach((item: any) => {
      doc.text(item.description || "Service", colDesc, y + 6);
      doc.text(String(Number(item.quantity)), colQty, y + 6, { align: "right" });
      doc.text(formatAmount(item.unit_price), colPrice, y + 6, { align: "right" });
      doc.text(formatAmount(item.amount), colAmt, y + 6, { align: "right" });
      y += 10;
      doc.setDrawColor(220, 220, 225);
      doc.line(margin, y, pageWidth - margin, y);
    });

    // Total
    const currency = invoice.currency.toUpperCase();
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Subtotal", pageWidth - margin - 60, y);
    doc.setTextColor(30, 30, 30);
    doc.text(`${currency} ${formatAmount(totalAmount)}`, colAmt, y, { align: "right" });

    y += 8;
    doc.setDrawColor(30, 64, 120);
    doc.setLineWidth(0.5);
    doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);
    y += 7;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Total", pageWidth - margin - 60, y);
    doc.text(`${currency} ${formatAmount(totalAmount)}`, colAmt, y, { align: "right" });

    if (invoice.paid_at) {
      y += 15;
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 12, 3, 3, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 163, 74);
      doc.text(`Payment received on ${format(new Date(invoice.paid_at), "MMMM d, yyyy")}`, margin + 5, y + 8);
    }

    const footerY = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Thank you for your business. This invoice was generated by ${branding.company_name || "DataPulseFlow"}.`, pageWidth / 2, footerY, { align: "center" });
    if (branding.company_website) {
      doc.text(branding.company_website, pageWidth / 2, footerY + 5, { align: "center" });
    }

    doc.save(`invoice-${invoice.id.slice(0, 8).toUpperCase()}.pdf`);
  };

  if (loading || loadingData) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p>Loading...</p></div>;
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Invoice not found</p>
        <Button variant="outline" onClick={() => navigate("/real-estate/dashboard")}>Go Back</Button>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    paid: { color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle, label: "Paid" },
    pending: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock, label: "Pending" },
    overdue: { color: "bg-red-100 text-red-800 border-red-200", icon: AlertTriangle, label: "Overdue" },
  };

  const status = statusConfig[invoice.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const currency = invoice.currency.toUpperCase();

  const displayItems = lineItems.length > 0
    ? lineItems
    : [{ id: "fallback", description: invoice.description || "Service charge", quantity: 1, unit_price: Number(invoice.amount), amount: Number(invoice.amount) }];

  return (
    <div className="min-h-screen bg-muted/30">
      <nav className="border-b border-border bg-card print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <Button variant="ghost" size="sm" onClick={() => navigate("/real-estate/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 sm:p-10 print:shadow-none print:border-0 print:p-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center print:bg-[hsl(215,60%,18%)]">
                  <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
                    <rect x="2" y="3" width="6" height="12" rx="1" fill="white" />
                    <rect x="10" y="6" width="6" height="9" rx="1" fill="white" opacity="0.7" />
                  </svg>
                </div>
                <h1 className="text-2xl font-serif-display font-bold text-foreground">
                  {branding.company_name || "DataPulseFlow"}
                </h1>
              </div>
              {branding.company_address && <p className="text-sm text-muted-foreground whitespace-pre-line">{branding.company_address}</p>}
              {branding.company_email && <p className="text-sm text-muted-foreground">{branding.company_email}</p>}
              {branding.company_phone && <p className="text-sm text-muted-foreground">{branding.company_phone}</p>}
              {branding.company_website && <p className="text-sm text-muted-foreground">{branding.company_website}</p>}
            </div>
            <div className="text-left sm:text-right">
              <h2 className="text-3xl font-serif-display font-bold text-primary mb-2">INVOICE</h2>
              <p className="text-sm text-muted-foreground">
                Invoice #: <span className="font-mono text-foreground">{invoice.id.slice(0, 8).toUpperCase()}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Date: {format(new Date(invoice.invoice_date), "MMMM d, yyyy")}
              </p>
              {invoice.due_date && (
                <p className="text-sm text-muted-foreground">
                  Due: {format(new Date(invoice.due_date), "MMMM d, yyyy")}
                </p>
              )}
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${status.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {status.label}
                </span>
              </div>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-8 p-4 rounded-lg bg-muted/50 print:bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Bill To</p>
            <p className="font-medium text-foreground">{clientProfile?.full_name || "—"}</p>
            {clientProfile?.company_name && <p className="text-sm text-muted-foreground">{clientProfile.company_name}</p>}
            <p className="text-sm text-muted-foreground">{clientProfile?.email || "—"}</p>
          </div>

          {/* Line Items */}
          <div className="mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary/20">
                  <th className="text-left py-3 font-semibold text-foreground">Description</th>
                  <th className="text-right py-3 font-semibold text-foreground w-20">Qty</th>
                  <th className="text-right py-3 font-semibold text-foreground w-28">Unit Price</th>
                  <th className="text-right py-3 font-semibold text-foreground w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="py-4 text-foreground">{item.description || "Service"}</td>
                    <td className="py-4 text-right font-mono text-foreground">{Number(item.quantity)}</td>
                    <td className="py-4 text-right font-mono text-foreground">{formatAmount(item.unit_price)}</td>
                    <td className="py-4 text-right font-mono text-foreground">
                      {currency} {formatAmount(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono text-foreground">{currency} {formatAmount(totalAmount)}</span>
              </div>
              <div className="flex justify-between py-3 border-b-2 border-primary">
                <span className="font-bold text-foreground text-lg">Total</span>
                <span className="font-bold font-mono text-foreground text-lg">{currency} {formatAmount(totalAmount)}</span>
              </div>
            </div>
          </div>

          {invoice.paid_at && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 mb-6 print:bg-green-50">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-800">
                  Payment received on {format(new Date(invoice.paid_at), "MMMM d, yyyy")}
                </p>
              </div>
            </div>
          )}

          <div className="text-center pt-6 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Thank you for your business. This invoice was generated by {branding.company_name || "DataPulseFlow"}.
            </p>
            {branding.company_website && (
              <p className="text-xs text-muted-foreground mt-1">{branding.company_website}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealEstateInvoiceView;
