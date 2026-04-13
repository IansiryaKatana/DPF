import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const plans = [
  {
    name: "Growth",
    planKey: "growth",
    price: "$500",
    period: "/mo",
    description: "For teams getting started with managed Shopify data ops.",
    features: [
      "Live webhook ingestion engine",
      "Scheduled reconciliation sync",
      "Monitoring dashboard access",
      "6 verified webhook topics",
      "7-module data sync",
      "Basic support SLA (24–48h)",
      "Monthly sync reports",
    ],
    highlighted: false,
    cta: "Start Free Trial",
  },
  {
    name: "Pro",
    planKey: "pro",
    price: "$700",
    period: "/mo",
    description: "For scaling operations that demand priority and insights.",
    features: [
      "Everything in Growth",
      "Priority support SLA (same-day)",
      "Advanced monitoring & alerts",
      "Monthly optimization audit call",
      "Proactive incident detection",
      "Custom sync frequency tuning",
      "Dedicated account manager",
    ],
    highlighted: true,
    cta: "Start Free Trial",
  },
  {
    name: "Enterprise",
    planKey: "enterprise",
    price: "$12,000",
    period: " one-time",
    description: "Full platform license with complete handover and ownership.",
    features: [
      "Complete codebase handover",
      "Full infrastructure ownership",
      "Deployment documentation",
      "30 days post-handover support",
      "Architecture walkthrough",
      "Custom integration options",
      "No recurring fees",
    ],
    highlighted: false,
    cta: "Contact Us",
  },
];

const PricingSection = () => {
  const [planPriceOverrides, setPlanPriceOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadPlanPrices = async () => {
      const { data, error } = await supabase
        .from("admin_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["plan_price_growth", "plan_price_pro", "plan_price_enterprise"]);

      if (error || !data) return;

      const parsePrice = (value: string | null | undefined) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };

      const growth = parsePrice(data.find((s) => s.setting_key === "plan_price_growth")?.setting_value);
      const pro = parsePrice(data.find((s) => s.setting_key === "plan_price_pro")?.setting_value);
      const enterprise = parsePrice(data.find((s) => s.setting_key === "plan_price_enterprise")?.setting_value);

      setPlanPriceOverrides({
        ...(growth ? { growth } : {}),
        ...(pro ? { pro } : {}),
        ...(enterprise ? { enterprise } : {}),
      });
    };

    void loadPlanPrices();
  }, []);

  return (
    <section className="py-16 md:py-20 px-4 md:px-6 w-full" id="pricing">
      <div className="w-full max-w-[1600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 md:mb-16"
        >
          <p className="text-sm font-medium text-muted-foreground mb-2">Pricing</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif-display text-foreground mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base">
            Choose managed operations for ongoing value, or a one-time license for full ownership.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`rounded-3xl p-6 md:p-8 flex flex-col ${
                plan.highlighted
                  ? "bg-primary text-primary-foreground ring-2 ring-primary"
                  : "bg-card border border-border"
              }`}
            >
              <div className="mb-6">
                {plan.highlighted && (
                  <span className="inline-block bg-primary-foreground/20 text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full mb-3">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl md:text-2xl font-serif-display mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl md:text-4xl font-serif-display">
                    {(() => {
                      const overridePrice = planPriceOverrides[plan.planKey];
                      if (!overridePrice) return plan.price;
                      return `$${overridePrice.toLocaleString()}`;
                    })()}
                  </span>
                  <span className={`text-sm ${plan.highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {plan.period}
                  </span>
                </div>
                <p className={`text-sm mt-3 leading-relaxed ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlighted ? "text-primary-foreground/80" : "text-primary"}`} />
                    <span className={plan.highlighted ? "text-primary-foreground/90" : "text-foreground"}>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlighted ? "secondary" : "hero"}
                size="lg"
                className="w-full rounded-xl justify-between"
                asChild
              >
                <Link to={`/register?plan=${plan.planKey}`}>
                  {plan.cta}
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
