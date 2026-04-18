import { Button } from "@/components/ui/button";
import { ArrowUpRight, Webhook, RefreshCw, Database, Shield, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const HeroSection = () => {
  return (
    <section className="min-h-[85vh] pt-24 pb-8 px-4 md:px-6 flex items-center">
      <div className="w-full mx-auto h-full">
        <div className="grid lg:grid-cols-2 gap-4 lg:gap-6" style={{ minHeight: 'calc(85vh - 8rem)' }}>
          {/* Left: Text & CTA */}
          <div className="flex flex-col gap-4 lg:gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-section-accent rounded-3xl p-8 md:p-12 lg:p-16 flex-1 flex flex-col justify-center"
            >
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif-display text-foreground leading-[1.1] mb-6 lg:mb-8">
                Your Shopify data.<br />Always in sync.
              </h1>
              <p className="text-muted-foreground text-base md:text-lg lg:text-xl max-w-lg leading-relaxed">
                A managed data operations platform that connects your Shopify store to your business systems with real-time webhooks, intelligent sync, and enterprise-grade reliability.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="hero" size="xl" className="w-full justify-between rounded-2xl h-16 md:h-20 lg:h-24 px-8 md:px-10 text-base md:text-lg lg:text-xl" asChild>
                  <Link to="/register">
                    Request a Demo
                    <ArrowUpRight className="w-5 h-5 lg:w-6 lg:h-6" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="xl"
                  className="w-full justify-between rounded-2xl h-16 md:h-20 lg:h-24 px-8 md:px-10 text-base md:text-lg lg:text-xl border-border bg-background hover:bg-section-light"
                  asChild
                >
                  <Link to="/real-estate">
                    Real Estate Suite
                    <ArrowUpRight className="w-5 h-5 lg:w-6 lg:h-6" />
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Right: Platform Visualization */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="bg-hero-bg rounded-3xl p-6 md:p-8 lg:p-12 flex items-center justify-center relative overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-7 w-full max-w-xl">
              {/* Webhook Card */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="bg-hero-card rounded-2xl p-5 md:p-6 lg:p-8 shadow-sm"
              >
                <Webhook className="w-9 h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 text-primary mb-3 lg:mb-4" />
                <p className="font-semibold text-foreground text-base md:text-lg lg:text-xl">6 Webhooks</p>
                <p className="text-sm lg:text-base text-muted-foreground mt-1.5">Live & verified</p>
                <div className="mt-4 flex gap-1.5">
                  {[1,2,3,4,5,6].map(i => (
                    <motion.div
                      key={i}
                      className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-primary"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </motion.div>

              {/* Sync Card */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="bg-hero-card rounded-2xl p-5 md:p-6 lg:p-8 shadow-sm mt-6 lg:mt-10"
              >
                <RefreshCw className="w-9 h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 text-primary mb-3 lg:mb-4" />
                <p className="font-semibold text-foreground text-base md:text-lg lg:text-xl">Sync Engine</p>
                <p className="text-sm lg:text-base text-muted-foreground mt-1.5">7 modules active</p>
                <div className="mt-4 bg-section-light rounded-xl px-4 py-2 text-sm lg:text-base text-muted-foreground flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  Running
                </div>
              </motion.div>

              {/* Data Card */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="bg-hero-card rounded-2xl p-4 md:p-5 lg:p-6 shadow-sm"
              >
                <Database className="w-8 h-8 lg:w-10 lg:h-10 text-primary mb-2 lg:mb-3" />
                <p className="font-semibold text-foreground text-sm lg:text-base">Data Layer</p>
                <div className="mt-2 space-y-1 lg:space-y-1.5">
                  {["Customers", "Orders", "Products"].map(label => (
                    <div key={label} className="text-xs lg:text-sm text-muted-foreground bg-section-light rounded px-2 py-1 lg:py-1.5">{label}</div>
                  ))}
                </div>
              </motion.div>

              {/* Security Card */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
                className="bg-hero-card rounded-2xl p-4 md:p-5 lg:p-6 shadow-sm mt-6 lg:mt-10"
              >
                <Shield className="w-8 h-8 lg:w-10 lg:h-10 text-primary mb-2 lg:mb-3" />
                <p className="font-semibold text-foreground text-sm lg:text-base">Secured</p>
                <p className="text-xs lg:text-sm text-muted-foreground mt-1">HMAC verified</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs lg:text-sm text-primary font-medium">
                  <Zap className="w-3 h-3 lg:w-4 lg:h-4" /> Encrypted
                </div>
              </motion.div>
            </div>

          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
