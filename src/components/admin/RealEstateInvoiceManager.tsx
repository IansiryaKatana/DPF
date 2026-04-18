import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendNotifyEmail } from "@/lib/send-email";
import { invoiceEmail } from "@/lib/email-templates";
import { isEmailScenarioEnabled } from "@/lib/email-scenarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface InvoiceForm {
  user_id: string;
  amount: string;
  currency: string;
  description: string;
  status: string;
  invoice_date: string;
  due_date: string;
}

const emptyForm: InvoiceForm = {
  user_id: "",
  amount: "",
  currency: "usd",
  description: "",
  status: "pending",
  invoice_date: new Date().toISOString().split("T")[0],
  due_date: "",
};

const RealEstateInvoiceManager = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchInvoices = async () => {
    const { data } = await supabase.from("realestate_invoices").select("*").order("invoice_date", { ascending: false });
    const now = new Date();
    const enriched = (data || []).map((inv: any) => {
      if (inv.status === "pending" && inv.due_date && new Date(inv.due_date) < now) {
        return { ...inv, status: "overdue" };
      }
      return inv;
    });
    setInvoices(enriched);
  };

  const fetchClients = async () => {
    const [{ data: reProfiles }, { data: profiles }] = await Promise.all([
      supabase.from("realestate_user_profile").select("user_id, full_name, company_name"),
      supabase.from("profiles").select("user_id, email, full_name, company_name"),
    ]);

    const byUser = new Map<string, any>();
    (profiles || []).forEach((p: any) => {
      byUser.set(p.user_id, {
        user_id: p.user_id,
        full_name: p.full_name || "",
        company_name: p.company_name || "",
        email: p.email || "",
      });
    });
    (reProfiles || []).forEach((rp: any) => {
      const existing = byUser.get(rp.user_id) || { user_id: rp.user_id, email: "" };
      byUser.set(rp.user_id, {
        ...existing,
        full_name: rp.full_name || existing.full_name || "",
        company_name: rp.company_name || existing.company_name || "",
      });
    });
    setClients(Array.from(byUser.values()));
  };

  useEffect(() => {
    fetchInvoices();
    fetchClients();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (inv: any) => {
    setForm({
      user_id: inv.user_id,
      amount: String(inv.amount ?? ""),
      currency: inv.currency || "usd",
      description: inv.description || "",
      status: inv.status || "pending",
      invoice_date: inv.invoice_date?.split("T")[0] || "",
      due_date: inv.due_date?.split("T")[0] || "",
    });
    setEditingId(inv.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.user_id) return toast.error("Client is required");
    const parsedAmount = Number(form.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter a valid amount");

    setSaving(true);
    try {
      const payload = {
        user_id: form.user_id,
        amount: parsedAmount,
        currency: form.currency,
        description: form.description || null,
        status: form.status,
        invoice_date: form.invoice_date || new Date().toISOString(),
        due_date: form.due_date || null,
        paid_at: form.status === "paid" ? new Date().toISOString() : null,
      };

      let invoiceId = editingId;
      if (editingId) {
        const { error } = await supabase.from("realestate_invoices").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        invoiceId = crypto.randomUUID();
        const { error } = await supabase.from("realestate_invoices").insert({ ...payload, id: invoiceId });
        if (error) throw error;
      }

      if (!editingId && invoiceId) {
        const client = clients.find((c) => c.user_id === form.user_id);
        if (client?.email && (await isEmailScenarioEnabled("invoice_created"))) {
          const invoiceUrl = `${window.location.origin}/real-estate/invoice/${invoiceId}`;
          const email = invoiceEmail({
            clientName: client.full_name || "Valued Client",
            invoiceNumber: invoiceId.slice(0, 8).toUpperCase(),
            amount: `${form.currency.toUpperCase()} ${parsedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
            dueDate: form.due_date ? format(new Date(form.due_date), "MMMM d, yyyy") : "Upon receipt",
            invoiceUrl,
          });
          sendNotifyEmail({ to: client.email, ...email, templateName: "invoice-created" }).catch(() => {});
        }
      }

      toast.success(editingId ? "Invoice updated" : "Invoice created");
      setDialogOpen(false);
      fetchInvoices();
    } catch (error: any) {
      toast.error("Failed: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("realestate_invoices").delete().eq("id", id);
    if (error) toast.error("Failed to delete invoice");
    else {
      toast.success("Invoice deleted");
      fetchInvoices();
    }
    setDeleteConfirm(null);
  };

  const getClientName = (userId: string) => {
    const c = clients.find((client) => client.user_id === userId);
    return c ? (c.full_name || c.email || "Unknown") : userId.slice(0, 8);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive"; icon: any }> = {
      paid: { variant: "default", icon: CheckCircle },
      pending: { variant: "secondary", icon: Clock },
      overdue: { variant: "destructive", icon: AlertTriangle },
    };
    const s = map[status] || map.pending;
    const Icon = s.icon;
    return <Badge variant={s.variant}><Icon className="w-3 h-3 mr-1" />{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/50"><FileText className="w-5 h-5 text-primary" /></div>
            <div>
              <CardTitle className="text-xl">Real Estate Invoices</CardTitle>
              <CardDescription>Create and manage invoices for Real Estate clients only.</CardDescription>
            </div>
          </div>
          <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4 mr-2" /> New Invoice</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No Real Estate invoices yet</p>
        ) : invoices.map((inv: any) => (
          <div key={inv.id} className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-medium">{getClientName(inv.user_id)}</p>
              <p className="text-xs text-muted-foreground">
                {inv.currency?.toUpperCase()} {Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} - {format(new Date(inv.invoice_date), "MMM d, yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {statusBadge(inv.status)}
              <Button variant="outline" size="sm" onClick={() => openEdit(inv)}><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(inv.id)}><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Invoice" : "New Invoice"}</DialogTitle>
            <DialogDescription>Invoices created here are stored in `realestate_invoices`.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-2">
              <Label>Client</Label>
              <Select value={form.user_id} onValueChange={(value) => setForm({ ...form, user_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.full_name || c.email || c.user_id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Amount</Label><Input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toLowerCase() })} /></div>
            <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">pending</SelectItem><SelectItem value="paid">paid</SelectItem><SelectItem value="overdue">overdue</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Invoice Date</Label><Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} /></div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div className="sm:col-span-2 space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional invoice note" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : (editingId ? "Update" : "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete Invoice</DialogTitle><DialogDescription>This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default RealEstateInvoiceManager;
