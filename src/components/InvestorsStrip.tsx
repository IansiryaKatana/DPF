const techStack = [
  "Shopify Admin API",
  "GraphQL",
  "Supabase",
  "Edge Functions",
  "PostgreSQL",
  "HMAC Auth",
  "Real-Time Sync",
];

const InvestorsStrip = () => {
  return (
    <section className="py-12 px-4 md:px-6 w-full">
      <div className="w-full max-w-[1600px] mx-auto">
        <p className="text-center text-sm text-muted-foreground mb-8">Powered by enterprise-grade technology</p>
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-14">
          {techStack.map((name) => (
            <span
              key={name}
              className="text-foreground/40 font-semibold text-xs sm:text-sm md:text-base tracking-wide uppercase"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default InvestorsStrip;
