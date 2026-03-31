import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import MarqueeStrip from "@/components/MarqueeStrip";
import InvestorsStrip from "@/components/InvestorsStrip";
import StatsSection from "@/components/StatsSection";
import ProblemSolution from "@/components/ProblemSolution";
import WhyEaseSection from "@/components/WhyEaseSection";
import ProductsSection from "@/components/ProductsSection";
import PricingSection from "@/components/PricingSection";
import ComplianceSection from "@/components/ComplianceSection";
import AboutCTA from "@/components/AboutCTA";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <MarqueeStrip />
      <InvestorsStrip />
      <StatsSection />
      <ProblemSolution />
      <WhyEaseSection />
      <ProductsSection />
      <PricingSection />
      <ComplianceSection />
      <AboutCTA />
      <Footer />
    </div>
  );
};

export default Index;
