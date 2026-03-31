import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendNotifyEmail } from "@/lib/send-email";
import { invoiceEmail } from "@/lib/email-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, FileText, CheckCircle, Clock, AlertTriangle, Eye, X
} from "lucide-react";
import { format } from "date-fns";

interface LineItem {
  id?: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface InvoiceForm {
  user_id: string;
  currency: string;
  description: string;
  status: string;
  invoice_date: string;
  due_date: string;
  lineItems: LineItem[];
}

const emptyLineItem: LineItem = { description: "", quantity: "1", unit_price: "" };

const emptyForm: InvoiceForm = {
  user_id: "",
  currency: "usd",
  description: "",
  status: "pending",
  invoice_date: new Date().toISOString().split("T")[0],
  due_date: "",
  lineItems: [{ ...emptyLineItem }],
};

const InvoiceManager = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .order("invoice_date", { ascending: false });
    // Enrich with client-side overdue detection
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
    const { data } = await supabase.from("profiles").select("user_id, full_name, email, company_name");
    setClients(data || []);
  };

  useEffect(() => {
    fetchInvoices();
    fetchClients();
  }, []);

  const calcTotal = (items: LineItem[]) =>
    items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = async (inv: any) => {
    // Fetch line items
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", inv.id)
      .order("created_at");

    const lineItems: LineItem[] = items && items.length > 0
      ? items.map((it: any) => ({ id: it.id, description: it.description, quantity: String(it.quantity), unit_price: String(it.unit_price) }))
      : [{ ...emptyLineItem }];

    setForm({
      user_id: inv.user_id,
      currency: inv.currency,
      description: inv.description || "",
      status: inv.status,
      invoice_date: inv.invoice_date?.split("T")[0] || "",
      due_date: inv.due_date?.split("T")[0] || "",
      lineItems,
    });
    setEditingId(inv.id);
    setDialogOpen(true);
  };

  const addLineItem = () => setForm({ ...form, lineItems: [...form.lineItems, { ...emptyLineItem }] });

  const removeLineItem = (idx: number) => {
    if (form.lineItems.length <= 1) return;
    setForm({ ...form, lineItems: form.lineItems.filter((_, i) => i !== idx) });
  };

  const updateLineItem = (idx: number, field: keyof LineItem, value: string) => {
    const items = [...form.lineItems];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, lineItems: items });
  };

  const handleSave = async () => {
    if (!form.user_id) {
      toast.error("Client is required");
      return;
    }
    const total = calcTotal(form.lineItems);
    if (total <= 0) {
      toast.error("Add at least one line item with a valid price");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: form.user_id,
        amount: total,
        currency: form.currency,
        description: form.description || null,
        status: form.status,
        invoice_date: form.invoice_date || new Date().toISOString(),
        due_date: form.due_date || null,
        paid_at: form.status === "paid" ? new Date().toISOString() : null,
      };

      let invoiceId = editingId;

      if (editingId) {
        const { error } = await supabase.from("invoices").update(payload).eq("id", editingId);
        if (error) throw error;
        // Delete old line items and re-insert
        await supabase.from("invoice_items").delete().eq("invoice_id", editingId);
      } else {
        invoiceId = crypto.randomUUID();
        const { error } = await supabase.from("invoices").insert({ ...payload, id: invoiceId });
        if (error) throw error;
      }

      // Insert line items
      const itemsPayload = form.lineItems
        .filter(it => it.description || parseFloat(it.unit_price) > 0)
        .map(it => ({
          invoice_id: invoiceId!,
          description: it.description || "Service",
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price) || 0,
        }));

      if (itemsPayload.length > 0) {
        const { error: itemsError } = await supabase.from("invoice_items").insert(itemsPayload);
        if (itemsError) throw itemsError;
      }

      // Send email notification for new invoices
      if (!editingId && invoiceId) {
        const client = clients.find(c => c.user_id === form.user_id);
        if (client?.email) {
          const invoiceUrl = `${window.location.origin}/invoice/${invoiceId}`;
          const email = invoiceEmail({
            clientName: client.full_name || "Valued Client",
            invoiceNumber: invoiceId.slice(0, 8).toUpperCase(),
            amount: `${form.currency.toUpperCase()} ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
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
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete invoice");
    } else {
      toast.success("Invoice deleted");
      fetchInvoices();
    }
    setDeleteConfirm(null);
  };

  const getClientName = (userId: string) => {
    const c = clients.find(c => c.user_id === userId);
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
    return (
      <Badge variant={s.variant}>
        <Icon className="w-3 h-3 mr-1" />{status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/50">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Invoices</CardTitle>
              <CardDescription>Create, edit, and manage client invoices with line items</CardDescription>
            </div>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-2" /> New Invoice
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No invoices yet. Create your first invoice.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Invoice #</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Client</th>
                  <th className="text-left py-2 text-muted-foreground font-medium hidden sm:table-cell">Description</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Amount</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-2 text-muted-foreground font-medium hidden sm:table-cell">Date</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="py-3 font-mono text-xs text-foreground">{inv.id.slice(0, 8).toUpperCase()}</td>
                    <td className="py-3 text-foreground font-medium">{getClientName(inv.user_id)}</td>
                    <td className="py-3 text-muted-foreground hidden sm:table-cell max-w-48 truncate">{inv.description || "—"}</td>
                    <td className="py-3 text-foreground font-mono">
                      {inv.currency.toUpperCase()} {Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3">{statusBadge(inv.status)}</td>
                    <td className="py-3 text-muted-foreground hidden sm:table-cell">
                      {format(new Date(inv.invoice_date), "MMM d, yyyy")}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(inv)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {deleteConfirm === inv.id ? (
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(inv.id)}>
                            Confirm
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(inv.id)} title="Delete">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update invoice details and line items" : "Create a new branded invoice with line items"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.full_name || c.email} {c.company_name ? `(${c.company_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD</SelectItem>
                    <SelectItem value="eur">EUR</SelectItem>
                    <SelectItem value="gbp">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description / Notes</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Growth Plan - March 2026"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Date</Label>
                <Input
                  type="date" value={form.invoice_date}
                  onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date" value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="w-3 h-3 mr-1" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_80px_100px_32px] gap-2 text-xs text-muted-foreground font-medium px-1">
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit Price</span>
                  <span></span>
                </div>
                {form.lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                      placeholder="Service description"
                    />
                    <Input
                      type="number" min="1" step="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                    />
                    <Input
                      type="number" min="0" step="0.01"
                      value={item.unit_price}
                      onChange={(e) => updateLineItem(idx, "unit_price", e.target.value)}
                      placeholder="0.00"
                    />
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => removeLineItem(idx)}
                      disabled={form.lineItems.length <= 1}
                      className="h-8 w-8"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2 border-t border-border">
                <div className="text-right">
                  <span className="text-sm text-muted-foreground mr-3">Total:</span>
                  <span className="text-lg font-bold font-mono text-foreground">
                    {form.currency.toUpperCase()} {calcTotal(form.lineItems).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default InvoiceManager;
