type SubscriptionLike = {
  plan?: string | null;
  status?: string | null;
} | null;

type AccessCodeLike = {
  plan?: string | null;
  expires_at?: string | null;
  status?: string | null;
} | null;

type InvoiceLike = {
  status?: string | null;
};

/** True when the user has ever completed a paid plan (not the initial free trial). */
export function hasEverHadPaidPlan(options: {
  subscription?: SubscriptionLike;
  latestAccessCode?: AccessCodeLike;
  invoices?: InvoiceLike[];
}): boolean {
  const { subscription, latestAccessCode, invoices = [] } = options;

  const subPlan = String(subscription?.plan ?? "").trim().toLowerCase();
  if (subPlan && subPlan !== "trial") return true;

  const codePlan = String(latestAccessCode?.plan ?? "").trim().toLowerCase();
  if (latestAccessCode && codePlan && codePlan !== "trial") return true;

  return invoices.some((inv) => String(inv.status ?? "").trim().toLowerCase() === "paid");
}

/** True for brand-new accounts still on the free trial (never purchased a plan). */
export function isNewTrialUser(options: {
  subscription?: SubscriptionLike;
  latestAccessCode?: AccessCodeLike;
  invoices?: InvoiceLike[];
  subStatus?: string | null;
}): boolean {
  const subStatus = String(options.subStatus ?? "trialing").toLowerCase();
  if (subStatus !== "trialing") return false;
  return !hasEverHadPaidPlan(options);
}
