import { motion } from "framer-motion";

const StatsSection = () => {
  return (
    <section className="py-16 md:py-20 px-4 md:px-6 w-full" id="platform">
      <div className="w-full max-w-[1600px] mx-auto">
        <div className="bg-section-accent rounded-3xl p-8 md:p-12 lg:p-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm font-medium text-muted-foreground mb-2">Platform overview</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif-display text-foreground max-w-2xl mb-12">
              Built from scratch for Shopify data operations, with reliability at the core.
            </h2>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {[
              { value: "6", label: "Live webhooks" },
              { value: "7", label: "Sync modules" },
              { value: "99.9%", label: "Uptime SLA" },
              { value: "<2s", label: "Event processing" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <p className="text-3xl sm:text-4xl md:text-5xl font-serif-display text-stat-value">{stat.value}</p>
                <p className="text-muted-foreground mt-1 text-sm">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
