import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import Grainient from "@/components/Grainient";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Check, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const pageSections = {
  overview: "overview",
  subscription: "subscription",
  faq: "faq",
} as const;

const reveal = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

const heroSequence = {
  container: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.14,
        delayChildren: 0.12,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: 22 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
    },
  },
};

/** Same Grainient settings as the homepage hero for matching section backgrounds */
const homepageGrainientProps = {
  color1: "#a9a9a9",
  color2: "#0e0338",
  color3: "#B497CF",
  timeSpeed: 0.25,
  colorBalance: 0,
  warpStrength: 1,
  warpFrequency: 5,
  warpSpeed: 2,
  warpAmplitude: 50,
  blendAngle: 0,
  blendSoftness: 0.05,
  rotationAmount: 500,
  noiseScale: 2,
  grainAmount: 0.1,
  grainScale: 2,
  grainAnimated: false,
  contrast: 1.5,
  gamma: 1,
  saturation: 1,
  centerX: 0,
  centerY: 0,
  zoom: 0.9,
} as const;

const functionalityBlocks = [
  {
    title: "CRM to Website Property Sync",
    text: "When a property is added or updated in the CRM, the website can reflect those changes automatically. This reduces duplicate work and keeps listings current without manual uploading.",
  },
  {
    title: "Property Portal Lead Sync",
    text: "Leads and related property data from platforms such as Property Finder can be brought into the CRM automatically so inquiries are captured quickly and managed in one place.",
  },
  {
    title: "Map Location Services",
    text: "Map functionality helps users search and understand listings by area and location, making the browsing experience more useful and intuitive.",
  },
  {
    title: "Currency Conversion",
    text: "Pricing can be adapted for different audiences to create a smoother experience for international users and investors reviewing listings.",
  },
  {
    title: "SQM to SQFT Conversion",
    text: "Property sizes can be displayed in the measurement units most familiar to the user, reducing friction and improving clarity.",
  },
  {
    title: "WhatsApp Business Integration",
    text: "Sales teams can communicate with leads through structured CRM workflows instead of handling everything manually outside the system.",
  },
  {
    title: "Email Delivery and Templates",
    text: "Teams can send structured, branded, and repeatable lead emails from within the CRM process to improve speed and consistency.",
  },
  {
    title: "PDF and DOCX Generation",
    text: "Property offers, brochures, summaries, and other sales documents can be generated on demand instead of being recreated manually each time.",
  },
];

const subscriptions = [
  {
    title: "Monthly",
    price: "$499 / month",
    text: "Access to the infrastructure suite required to operate the implemented live functions.",
  },
  {
    title: "Annual",
    price: "$4,790 / year",
    text: "Reduced effective rate for businesses ready to commit annually.",
  },
  {
    title: "Lifetime",
    price: "$14,000 one-time",
    text: "Permanent license access to the infrastructure suite as implemented for the subscribed system.",
  },
];

const parsePrice = (raw: string | null | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const pricingCtas = [
  "Activate Subscription",
  "Activate Subscription",
  "Speak to Sales",
];

const faqs = [
  {
    q: "What exactly is included in the subscription?",
    a: "The subscription covers the infrastructure suite used to enable the live functions connected to your platform, including syncing, lead flow, communication support, document generation, and user-facing utility services.",
  },
  {
    q: "Is this a single API?",
    a: "No. It is a full suite subscription made up of the service layer required to support multiple connected functions across a real estate system.",
  },
  {
    q: "Do I need this if I already have a website and a CRM?",
    a: "If the website and CRM need to work together in real time and support live automation, then yes. The visible platforms alone do not replace the infrastructure that connects them.",
  },
  {
    q: "Can this support lead sources like Property Finder?",
    a: "Yes. It is designed to support bringing external lead flow into a cleaner internal process.",
  },
  {
    q: "Can my team use WhatsApp and email through the system?",
    a: "Yes. Communication-related functions can be enabled as part of the suite depending on your workflow setup.",
  },
  {
    q: "Can property documents be generated automatically?",
    a: "Yes. The infrastructure can support document generation for items such as offers, summaries, brochures, and similar property-related outputs.",
  },
  {
    q: "What happens after activation?",
    a: "Once activated, the connected functions can operate as part of the production setup for your website and CRM environment.",
  },
  {
    q: "Is hosting included?",
    a: "Not necessarily. Hosting and certain third-party operational costs may be separate depending on the deployment structure.",
  },
  {
    q: "Why is there a subscription instead of a one-time setup fee only?",
    a: "Because the infrastructure is a live service layer, not just a one-time build task. It supports ongoing connected functionality in production.",
  },
  {
    q: "Is there an annual option?",
    a: "Yes. Annual access is available at a reduced effective rate compared with monthly billing.",
  },
  {
    q: "Is there a lifetime option?",
    a: "Yes. A lifetime license can be offered for permanent access to the infrastructure suite as implemented for the subscribed system.",
  },
];

const RealEstateLanding = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [planPrices, setPlanPrices] = useState({
    monthly: 499,
    annual: 4790,
    lifetime: 14000,
  });

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const loadPlanPrices = async () => {
      const { data } = await supabase
        .from("admin_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "realestate_plan_price_growth",
          "realestate_plan_price_pro",
          "realestate_plan_price_enterprise",
        ]);
      const rows = data || [];
      setPlanPrices({
        monthly: parsePrice(rows.find((r: any) => r.setting_key === "realestate_plan_price_growth")?.setting_value, 499),
        annual: parsePrice(rows.find((r: any) => r.setting_key === "realestate_plan_price_pro")?.setting_value, 4790),
        lifetime: parsePrice(rows.find((r: any) => r.setting_key === "realestate_plan_price_enterprise")?.setting_value, 14000),
      });
    };
    loadPlanPrices();
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1f2c]">
      <header
        className={`fixed top-0 z-50 w-full transition-all duration-300 ${
          isScrolled
            ? "border-b border-border/50 bg-background/85 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-4 px-4 md:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="3" width="6" height="12" rx="1" fill="hsl(var(--primary-foreground))" />
                <rect x="10" y="6" width="6" height="9" rx="1" fill="hsl(var(--primary-foreground))" opacity="0.7" />
              </svg>
            </div>
            <span className={`text-xl font-serif-display ${isScrolled ? "text-foreground" : "text-white"}`}>DataPulseFlow</span>
          </Link>
          <nav
            className={`hidden flex-1 items-center justify-center gap-6 text-sm font-medium md:flex md:text-[1.125rem] lg:gap-8 ${
              isScrolled ? "text-[#475467]" : "text-white/90"
            }`}
            aria-label="Page sections"
          >
            <a
              href={`#${pageSections.overview}`}
              className={`transition-colors ${isScrolled ? "hover:text-[#111827]" : "hover:text-white"}`}
            >
              Overview
            </a>
            <a
              href={`#${pageSections.subscription}`}
              className={`transition-colors ${isScrolled ? "hover:text-[#111827]" : "hover:text-white"}`}
            >
              Subscription
            </a>
            <a
              href={`#${pageSections.faq}`}
              className={`transition-colors ${isScrolled ? "hover:text-[#111827]" : "hover:text-white"}`}
            >
              FAQ
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <Button
                asChild
                variant="outline"
                className={isScrolled ? "border-[#c9d0dc] bg-transparent text-[#1a1f2c]" : "border-white/70 bg-white text-[#1a1f2c]"}
              >
                <Link to="/real-estate/login?next=/real-estate/dashboard">Sign In</Link>
              </Button>
              <Button asChild className="bg-[#101828] text-white hover:bg-[#1d2939]">
                <Link to="/real-estate/register">Activate Subscription</Link>
              </Button>
            </div>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="!h-10 !w-10 min-h-10 min-w-10 shrink-0 rounded-lg border-0 bg-[#101828] text-white shadow-sm hover:bg-[#1d2939] hover:text-white md:hidden [&_svg]:!size-5"
                  aria-label="Open menu"
                >
                  <Menu className="!size-5" strokeWidth={1} aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-border/60 p-0 sm:max-w-sm">
                <SheetHeader className="border-b border-border/60 px-6 pb-4 pt-2 text-left">
                  <SheetTitle className="text-left text-base font-semibold">Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-1 flex-col gap-1 px-4 py-4" aria-label="Page sections">
                  <a
                    href={`#${pageSections.overview}`}
                    className="rounded-lg px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Overview
                  </a>
                  <a
                    href={`#${pageSections.subscription}`}
                    className="rounded-lg px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Subscription
                  </a>
                  <a
                    href={`#${pageSections.faq}`}
                    className="rounded-lg px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    FAQ
                  </a>
                </nav>
                <div className="mt-auto flex flex-col gap-3 border-t border-border/60 px-4 pb-6 pt-4">
                  <Button asChild variant="outline" className="w-full justify-center border-[#c9d0dc]">
                    <Link to="/real-estate/login?next=/real-estate/dashboard" onClick={() => setMobileMenuOpen(false)}>
                      Sign In
                    </Link>
                  </Button>
                  <Button asChild className="w-full justify-center bg-[#101828] text-white hover:bg-[#1d2939]">
                    <Link to="/real-estate/register" onClick={() => setMobileMenuOpen(false)}>
                      Activate Subscription
                    </Link>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="w-full pb-0">
        <motion.section
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 h-[85vh] min-h-[85vh] w-full overflow-hidden lg:sticky lg:top-0"
        >
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
            <Grainient {...homepageGrainientProps} />
          </div>
          <div className="pointer-events-none absolute inset-0 z-10 bg-white/58" aria-hidden />
          <div className="relative z-20 mx-auto flex h-[85vh] min-h-[85vh] w-full max-w-[1280px] flex-col items-start justify-end px-4 pb-10 pt-20 md:items-center md:justify-center md:px-6 md:pb-0 md:pt-0">
            <motion.div
              className="w-full max-w-3xl text-left md:text-center"
              variants={heroSequence.container}
              initial="hidden"
              animate="visible"
            >
              <motion.div className="mb-4 flex justify-start md:justify-center" variants={heroSequence.item}>
                <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  Infrastructure Suite for Real Estate Operations
                </p>
              </motion.div>
              <motion.h1
                className="text-4xl font-semibold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)] md:text-6xl"
                variants={heroSequence.item}
              >
                The Infrastructure Suite Behind Modern Real Estate Platforms
              </motion.h1>
              <motion.p
                className="mt-6 max-w-2xl text-base leading-7 text-white/90 md:mx-auto md:text-sm md:leading-relaxed"
                variants={heroSequence.item}
              >
                Connect your CRM, website, lead sources, and channels through one managed infrastructure layer—so listings, leads, and documents stay aligned. Built for real estate websites, CRMs, internal sales systems, and lead-driven property operations.
              </motion.p>
              <motion.div className="mt-8 flex flex-wrap items-center justify-start gap-3 md:justify-center" variants={heroSequence.item}>
                <Button asChild className="bg-[#101828] text-white hover:bg-[#1d2939]">
                  <Link to="/real-estate/register">
                    Activate Subscription <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild className="border-0 bg-white text-[#101828] hover:bg-white/90">
                  <Link to="/real-estate/register">Book a Demo</Link>
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </motion.section>

        <motion.section
          id={pageSections.overview}
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="scroll-mt-16 relative z-20 box-border flex min-h-[100vh] w-full flex-col bg-[#eef2f7] py-10 lg:sticky lg:top-0 lg:py-[100px]"
        >
          <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-between gap-12 px-4 md:gap-16 md:px-6">
            <div className="grid shrink-0 gap-6 md:grid-cols-[1.5fr_1fr] md:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667085] md:hidden">The problem</p>
                <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:mt-0 md:text-5xl">
                  The live service layer between your systems and your day-to-day operations
                </h2>
              </div>
              <div className="md:justify-self-end">
                <p className="max-w-md text-base leading-7 text-[#344054]">
                  Close the gap between a polished front end and how work actually gets done.
                </p>
              </div>
            </div>

            <Carousel
              className="w-full shrink-0"
              opts={{
                align: "start",
                loop: false,
                slidesToScroll: 1,
              }}
            >
              <CarouselContent className="-ml-4">
                {functionalityBlocks.map((item) => (
                  <CarouselItem key={item.title} className="basis-full pl-4 sm:basis-1/2 lg:basis-1/3">
                    <article className="flex aspect-[3/4] min-h-0 flex-col overflow-hidden rounded-2xl bg-white p-5">
                      <h3 className="w-[70%] max-w-[70%] shrink-0 text-[1.6rem] font-normal leading-snug tracking-tight text-[#1a1f2c]">
                        {item.title}
                      </h3>
                      <p className="mt-auto w-full shrink-0 break-words text-sm leading-6 text-[#475467] line-clamp-[8]">
                        {item.text}
                      </p>
                    </article>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <div className="mt-6 flex justify-end gap-2">
                <CarouselPrevious
                  variant="outline"
                  size="icon"
                  className="static left-0 top-0 translate-x-0 translate-y-0 rounded-full border-[#d0d5dd] bg-white hover:bg-[#f8fafc]"
                />
                <CarouselNext
                  variant="outline"
                  size="icon"
                  className="static right-0 top-0 translate-x-0 translate-y-0 rounded-full border-[#d0d5dd] bg-white hover:bg-[#f8fafc]"
                />
              </div>
            </Carousel>
          </div>
        </motion.section>

        <motion.section
          id={pageSections.subscription}
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="relative z-30 flex min-h-[100vh] w-full flex-col bg-[#101828] py-12 text-white lg:sticky lg:top-0 lg:py-[100px]"
        >
          <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-4 md:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Our Plans</h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-white/70 md:text-base">
                Access to the infrastructure suite required to operate live real estate platform functions.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:mt-12 md:gap-6">
              {subscriptions.map((item, i) => (
                <motion.article
                  key={item.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className={`flex flex-col rounded-3xl p-6 md:p-8 ${
                    i === 1 ? "bg-white text-[#101828] ring-2 ring-white/70" : "bg-white/10 text-white"
                  }`}
                >
                  {i === 1 && (
                    <span className="mb-3 inline-block rounded-full bg-[#101828]/10 px-3 py-1 text-xs font-semibold text-[#101828]">
                      Most Popular
                    </span>
                  )}
                  <h3 className="mb-2 text-xl md:text-2xl">{item.title}</h3>
                  <p className="text-3xl md:text-4xl">
                    {i === 0
                      ? `$${planPrices.monthly.toLocaleString()} / month`
                      : i === 1
                      ? `$${planPrices.annual.toLocaleString()} / year`
                      : `$${planPrices.lifetime.toLocaleString()} one-time`}
                  </p>
                  <p className={`mt-3 text-sm leading-relaxed ${i === 1 ? "text-[#344054]" : "text-white/80"}`}>{item.text}</p>
                  <ul className="mb-8 mt-6 space-y-3 flex-1">
                    <li className="flex items-start gap-2.5 text-sm">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${i === 1 ? "text-[#101828]" : "text-white/80"}`} />
                      <span className={i === 1 ? "text-[#101828]" : "text-white/90"}>Infrastructure suite activation</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-sm">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${i === 1 ? "text-[#101828]" : "text-white/80"}`} />
                      <span className={i === 1 ? "text-[#101828]" : "text-white/90"}>Production workflow support</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-sm">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${i === 1 ? "text-[#101828]" : "text-white/80"}`} />
                      <span className={i === 1 ? "text-[#101828]" : "text-white/90"}>Connected platform operations</span>
                    </li>
                  </ul>
                  <Button
                    variant={i === 1 ? "secondary" : "ghost"}
                    className={`w-full justify-between rounded-xl ${
                      i === 1
                        ? "bg-[#101828] text-white hover:bg-[#1d2939]"
                        : "border border-white/30 !bg-transparent !text-white !hover:bg-[#1d2939] !hover:text-white hover:border-white/50"
                    }`}
                    asChild
                  >
                    <Link to="/real-estate/register">
                      {pricingCtas[i]}
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </motion.article>
              ))}
            </div>
            <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-white/65 md:mt-12">
              Operational costs related to hosting, third-party usage, or added support may apply separately depending on deployment structure.
            </p>
          </div>
        </motion.section>

        <motion.section
          id={pageSections.faq}
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="relative z-40 w-full overflow-hidden px-4 pb-8 pt-12 md:px-6 md:pb-12 md:pt-20 lg:sticky lg:top-0"
        >
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
            <Grainient {...homepageGrainientProps} />
          </div>
          <div className="pointer-events-none absolute inset-0 z-10 bg-white/58" aria-hidden />
          <div className="relative z-20 mx-auto w-full max-w-[1280px]">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] md:text-5xl">
              Frequently asked questions
            </h2>
            <Accordion type="single" collapsible className="mx-auto mt-8 w-full max-w-3xl space-y-2">
              {faqs.map((item, index) => (
                <motion.div
                  key={item.q}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.12, margin: "0px 0px -8% 0px" }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: Math.min(index * 0.04, 0.4) }}
                >
                  <AccordionItem value={`faq-${index}`} className="rounded-xl border border-[#e4e7ec] bg-white px-4">
                    <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline md:text-[1.4rem] md:leading-snug">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-6 text-[#475467]">{item.a}</AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-[#d9dee7] bg-[#f7f8fa] px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-[1280px]">
          <p className="text-left text-sm text-[#667085]">
            © {new Date().getFullYear()} DataPulseFlow. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default RealEstateLanding;
