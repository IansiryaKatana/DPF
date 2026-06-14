import { format, isSameDay } from "date-fns";

/** How to show the second date line on invoice headers. */
export type InvoiceSecondaryDate = {
  label: string;
  date: string;
} | null;

type InvoiceDateFields = {
  status?: string;
  invoice_date?: string;
  due_date?: string | null;
  paid_at?: string | null;
};

/**
 * Paid invoices: prefer stored due_date when it extends past invoice_date.
 * Legacy rows (due_date = payment day) fall back to access-code / subscription period end.
 */
export function resolveServicePeriodEndForPaidInvoice(
  invoice: InvoiceDateFields,
  accessCodeExpiresAt?: string | null,
  subscriptionPeriodEnd?: string | null,
): string | null {
  const invoiceDateRaw = invoice.invoice_date ?? invoice.paid_at;
  if (!invoiceDateRaw) return null;

  const invoiceDate = new Date(invoiceDateRaw);
  const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;

  if (dueDate && !isSameDay(invoiceDate, dueDate) && dueDate > invoiceDate) {
    return invoice.due_date!;
  }

  const candidates = [accessCodeExpiresAt, subscriptionPeriodEnd]
    .filter(Boolean)
    .map((value) => String(value));

  for (const candidate of candidates) {
    const end = new Date(candidate);
    if (!Number.isNaN(end.getTime()) && end > invoiceDate && !isSameDay(invoiceDate, end)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Invoice date = issue / charge date.
 * Service through / due = billing period end (paid) or payment due (pending).
 */
export function getInvoiceSecondaryDate(
  invoice: InvoiceDateFields,
  options?: {
    servicePeriodEnd?: string | null;
    subscriptionPeriodEnd?: string | null;
  },
): InvoiceSecondaryDate {
  const status = String(invoice.status ?? "pending").toLowerCase();

  if (status === "paid") {
    const serviceEnd = resolveServicePeriodEndForPaidInvoice(
      invoice,
      options?.servicePeriodEnd,
      options?.subscriptionPeriodEnd,
    );
    if (!serviceEnd) return null;
    return { label: "Service through", date: serviceEnd };
  }

  if (!invoice.due_date) return null;

  if (status === "overdue" || status === "pending") {
    return { label: "Due", date: invoice.due_date };
  }

  return { label: "Due", date: invoice.due_date };
}

export function formatInvoiceDisplayDate(value: string): string {
  return format(new Date(value), "MMMM d, yyyy");
}

/** True when a paid invoice still stores due_date on the payment day (pre-fix rows). */
export function paidInvoiceNeedsDueDateRepair(
  invoice: InvoiceDateFields,
  servicePeriodEnd?: string | null,
): boolean {
  if (String(invoice.status ?? "").toLowerCase() !== "paid" || !servicePeriodEnd) return false;
  if (!invoice.due_date || !invoice.invoice_date) return false;
  return (
    isSameDay(new Date(invoice.invoice_date), new Date(invoice.due_date)) &&
    !isSameDay(new Date(invoice.invoice_date), new Date(servicePeriodEnd))
  );
}
