/** Real Estate product plans — use separate Stripe Price/Product IDs from Shopify in production. */
export const REALESTATE_PLANS = {
  growth: {
    name: "Monthly",
    price: 499,
    price_id: "price_1TFPMJIwhoZJMJiypvQMjmK6",
    product_id: "prod_UDr4XQ5IJQ7fxh",
    billing_type: "recurring" as const,
    period_label: "/month",
  },
  pro: {
    name: "Annual",
    price: 4790,
    price_id: "price_1TFPMeIwhoZJMJiy0ywa2Qks",
    product_id: "prod_UDr4YKl4yCwtMs",
    billing_type: "recurring" as const,
    period_label: "/year",
  },
  enterprise: {
    name: "Lifetime",
    price: 14000,
    price_id: "price_1TFPMyIwhoZJMJiyt1ODKRF5",
    product_id: "prod_UDr5xQBVDlCZdr",
    billing_type: "one_time" as const,
    period_label: "one-time",
  },
} as const;

export type RealEstatePlanKey = keyof typeof REALESTATE_PLANS;

export const getRealEstatePlanByProductId = (productId: string): RealEstatePlanKey | null => {
  for (const [key, plan] of Object.entries(REALESTATE_PLANS)) {
    if (plan.product_id === productId) return key as RealEstatePlanKey;
  }
  return null;
};
