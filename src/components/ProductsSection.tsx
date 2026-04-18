import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const products = [
  {
    label: "Webhook ingestion engine",
    title: "Live event capture with cryptographic verification.",
    description: "Single intake endpoint for all Shopify topics. Header validation, HMAC signature verification, idempotency via unique webhook IDs, and full event lifecycle tracking from processing to success.",
    tags: ["6 webhook topics", "HMAC verified", "Idempotent", "Audit trail"],
    cta: "Learn more",
  },
  {
    label: "Core sync engine",
    title: "Multi-module data synchronization that never misses a beat.",
    description: "Upsert-first architecture covering customers, orders, order items, products, variants, collections, and purchase orders. Checkpoint cursors for incremental sync, newest-first processing, and real-time progress logging.",
    tags: ["7 sync modules", "Checkpoint cursors", "Resumable", "Newest-first"],
    cta: "Explore sync",
  },
  {
    label: "API connectivity layer",
    title: "Reliable Shopify API access with automatic token management.",
    description: "Connection diagnostics, backend token resolution, automatic credential refresh when tokens near expiry, and full lifecycle persistence with expiry tracking and rotation.",
    tags: ["Auto token refresh", "Connection testing", "Credential storage", "Lifecycle tracking"],
    cta: "Explore connectivity",
  },
];

const ProductsSection = () => {
  return (
    <section className="py-16 md:py-20 px-4 md:px-6 w-full">
      <div className="w-full max-w-[1600px] mx-auto space-y-6 md:space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="bg-section-light rounded-3xl p-6 md:p-8"
        >
          <p className="text-sm text-muted-foreground font-medium mb-3">Choose product line</p>
          <h3 className="text-xl md:text-2xl font-serif-display text-foreground mb-4">
            Same provider. Product-specific routing and workflows.
          </h3>
          <div className="flex flex-wrap gap-3">
            <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
              Shopify Webhook APIs
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link to="/real-estate" className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold">
              Real Estate API + Webhooks
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        {products.map((product, i) => (
          <motion.div
            key={product.title}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.1, duration: 0.6 }}
            className="bg-section-light rounded-3xl p-8 md:p-10 lg:p-14"
          >
            <p className="text-sm text-muted-foreground font-medium mb-2">{product.label}</p>
            <h3 className="text-xl sm:text-2xl md:text-3xl font-serif-display text-foreground mb-4 max-w-xl">
              {product.title}
            </h3>
            <p className="text-muted-foreground max-w-lg mb-6 leading-relaxed text-sm md:text-base">{product.description}</p>

            <div className="flex flex-wrap gap-2 mb-8">
              {product.tags.map((tag) => (
                <span key={tag} className="bg-badge-bg text-badge-foreground text-xs font-medium px-3 py-1.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>

            <a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all">
              {product.cta} <ArrowUpRight className="w-4 h-4" />
            </a>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default ProductsSection;
