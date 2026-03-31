import { motion } from "framer-motion";

const ProblemSolution = () => {
  return (
    <section className="py-12 md:py-16 px-4 md:px-6 w-full">
      <div className="w-full max-w-[1600px] mx-auto grid md:grid-cols-2 gap-6 md:gap-8">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="bg-card border border-border rounded-3xl p-8 md:p-10"
        >
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">The problem</p>
          <h3 className="text-lg sm:text-xl font-serif-display text-foreground leading-snug">
            Manual CSV exports, disconnected tools, and unreliable integrations leave your Shopify data fragmented — costing you visibility, accuracy, and revenue.
          </h3>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="bg-primary rounded-3xl p-8 md:p-10"
        >
          <p className="text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-4">The solution</p>
          <h3 className="text-lg sm:text-xl font-serif-display text-primary-foreground leading-snug">
            DataPulseFlow gives you a managed sync engine with live webhooks, automated reconciliation, and a monitoring dashboard — so your data is always accurate, always current.
          </h3>
        </motion.div>
      </div>
    </section>
  );
};

export default ProblemSolution;
