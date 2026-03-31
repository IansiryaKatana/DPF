import { motion } from "framer-motion";

const TestimonialSection = () => {
  return (
    <section className="py-16 md:py-20 px-4 md:px-6 w-full" id="case-studies">
      <div className="w-full max-w-[1600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-sm font-medium text-muted-foreground mb-2">Client success</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif-display text-foreground mb-12">
            What it's like working with DataPulseFlow
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="bg-primary rounded-3xl p-8 md:p-10 lg:p-14 text-primary-foreground"
        >
          <blockquote className="text-lg sm:text-xl md:text-2xl font-serif-display leading-relaxed mb-8 max-w-2xl">
            "We went from spending hours on manual data exports to having everything synced automatically. DataPulseFlow transformed our operations."
          </blockquote>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-foreground/20" />
            <div>
              <p className="font-semibold">Operations Director</p>
              <p className="text-sm text-primary-foreground/70">Mid-size Shopify Merchant</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mt-10 max-w-lg">
            <div>
              <p className="text-2xl md:text-3xl font-serif-display">95%</p>
              <p className="text-sm text-primary-foreground/70 mt-1">Reduction in manual data tasks</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-serif-display">&lt;2s</p>
              <p className="text-sm text-primary-foreground/70 mt-1">Average sync latency</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-serif-display">0</p>
              <p className="text-sm text-primary-foreground/70 mt-1">Missed webhook events</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default TestimonialSection;
