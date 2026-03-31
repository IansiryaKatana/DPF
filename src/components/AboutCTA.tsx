import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const AboutCTA = () => {
  return (
    <section className="py-16 md:py-20 px-4 md:px-6 w-full">
      <div className="w-full max-w-[1600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="bg-section-accent rounded-3xl p-8 md:p-12 lg:p-16 text-center"
        >
          <p className="text-sm font-medium text-muted-foreground mb-2">Ready to connect?</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif-display text-foreground mb-6 max-w-2xl mx-auto">
            Stop wrestling with data.<br />Start operating with confidence.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed text-sm md:text-base">
            DataPulseFlow was built by engineers who understand the reality of Shopify integrations. Every webhook, every sync module, every dashboard reflects how operations actually run.
          </p>
          <Button variant="hero" size="xl" className="rounded-full px-8 md:px-10" asChild>
            <Link to="/register">Request a Demo <ArrowUpRight className="w-5 h-5 ml-2" /></Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default AboutCTA;
