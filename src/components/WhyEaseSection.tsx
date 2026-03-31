import { motion } from "framer-motion";
import { Webhook, RefreshCw, Shield, Database, BarChart3, Wrench } from "lucide-react";

const features = [
  {
    icon: Webhook,
    title: "Real-time webhook ingestion",
    description: "6 verified Shopify webhooks with HMAC signature validation, idempotency enforcement, and full audit trails.",
  },
  {
    icon: RefreshCw,
    title: "Intelligent sync engine",
    description: "7-module sync covering customers, orders, products, variants, collections, and more — with checkpoint cursors and newest-first processing.",
  },
  {
    icon: Shield,
    title: "Enterprise-grade security",
    description: "Cryptographic HMAC verification, secure credential storage, token lifecycle management, and admin-only operational controls.",
  },
  {
    icon: Database,
    title: "Smart data mapping",
    description: "GraphQL extraction with relational normalization — linking orders to customers, variants to products, and metafields to your internal model.",
  },
  {
    icon: BarChart3,
    title: "Monitoring & observability",
    description: "Sync logs, webhook monitors, processing status tracking, and actionable error messaging — all in a clean dashboard.",
  },
  {
    icon: Wrench,
    title: "Crash-resistant architecture",
    description: "Soft timeout handling, duplicate event protection, resumable reruns, and historical recovery mechanisms for production safety.",
  },
];

const WhyEaseSection = () => {
  return (
    <section className="py-16 md:py-20 px-4 md:px-6 w-full" id="services">
      <div className="w-full max-w-[1600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-sm font-medium text-muted-foreground mb-2">Why DataPulseFlow</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif-display text-foreground mb-12">
            A complete data operations<br className="hidden sm:block" />platform, managed for you.
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="bg-card border border-border rounded-2xl p-6 md:p-8 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-section-accent flex items-center justify-center mb-5">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-base md:text-lg font-semibold text-foreground mb-2 font-sans">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyEaseSection;
