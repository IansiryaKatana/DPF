// DataPulseFlow subscription plan configuration
export const PLANS = {
  growth: {
    name: "Growth",
    price: 500,
    price_id: "price_1TFPMJIwhoZJMJiypvQMjmK6",
    product_id: "prod_UDr4XQ5IJQ7fxh",
    billing_type: "recurring",
  },
  pro: {
    name: "Pro",
    price: 700,
    price_id: "price_1TFPMeIwhoZJMJiy0ywa2Qks",
    product_id: "prod_UDr4YKl4yCwtMs",
    billing_type: "recurring",
  },
  enterprise: {
    name: "Enterprise",
    price: 12000,
    price_id: "price_1TFPMyIwhoZJMJiyt1ODKRF5",
    product_id: "prod_UDr5xQBVDlCZdr",
    billing_type: "one_time",
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export const getPlanByProductId = (productId: string): PlanKey | null => {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.product_id === productId) return key as PlanKey;
  }
  return null;
};
