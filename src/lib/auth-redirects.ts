/** Prevents open redirects: only same-origin relative paths. */
export function isSafeInternalRedirect(path: string): boolean {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("://")) return false;
  return true;
}

export function resolvePostLoginPath(options: {
  nextParam: string | null;
  isRealEstateUser: boolean;
  isAdmin: boolean;
}): string {
  const { nextParam, isRealEstateUser, isAdmin } = options;
  const raw = nextParam?.trim();
  if (raw) {
    const pathOnly = raw.split("?")[0] ?? "";
    if (isSafeInternalRedirect(pathOnly)) {
      return raw.startsWith("/") ? raw : `/${raw}`;
    }
  }
  if (isAdmin) return "/admin";
  if (isRealEstateUser) return "/real-estate/dashboard";
  return "/dashboard";
}

/** Used only by the Real Estate login page (`/real-estate/login`). */
export function resolveRealEstateLoginDestination(options: {
  nextParam: string | null;
  isRealEstateUser: boolean;
  isAdmin: boolean;
}): string {
  const { nextParam, isRealEstateUser, isAdmin } = options;

  // Admins must win over `next` — marketing links often use ?next=/real-estate/dashboard,
  // which would otherwise send staff to the customer dashboard.
  if (isAdmin) {
    return "/real-estate/admin";
  }

  const raw = nextParam?.trim();
  if (raw) {
    const pathOnly = raw.split("?")[0] ?? "";
    if (isSafeInternalRedirect(pathOnly)) {
      return raw.startsWith("/") ? raw : `/${raw}`;
    }
  }
  if (isRealEstateUser) return "/real-estate/dashboard";
  // Same URL as RE customers: RealEstateDashboard sends true Shopify-only users to /dashboard.
  return "/real-estate/dashboard";
}
