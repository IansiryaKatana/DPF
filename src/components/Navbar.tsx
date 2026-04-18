import { Button } from "@/components/ui/button";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="w-full flex items-center justify-between h-16 px-6 md:px-12">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="3" width="6" height="12" rx="1" fill="hsl(var(--primary-foreground))" />
              <rect x="10" y="6" width="6" height="9" rx="1" fill="hsl(var(--primary-foreground))" opacity="0.7" />
            </svg>
          </div>
          <span className="text-xl font-serif-display text-foreground">DataPulseFlow</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#platform" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Platform</a>
          <a href="#services" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Services</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign In</Link>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-0 bg-[#513885] text-white hover:bg-[#513885]/90 hover:text-white" asChild>
            <Link to="/real-estate">
              Real Estate Suite
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button variant="nav" size="sm" asChild>
            <Link to="/register">Start Free Trial</Link>
          </Button>
        </div>

        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background border-t border-border/50 overflow-hidden"
          >
            <div className="flex flex-col gap-4 p-6">
              <a href="#platform" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Platform</a>
              <a href="#services" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Services</a>
              <a href="#pricing" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Pricing</a>
              <Link to="/login" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Sign In</Link>
              <Button variant="nav" size="sm" className="w-full mt-2" asChild>
                <Link to="/register" onClick={() => setMobileOpen(false)}>Start Free Trial</Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
