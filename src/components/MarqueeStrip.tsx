const tags = [
  "Customers", "Orders", "Products", "Variants", "Collections",
  "Webhooks", "HMAC", "GraphQL", "Upsert", "Real-Time", "Reconciliation"
];

const MarqueeStrip = () => {
  return (
    <section className="py-6 overflow-hidden w-full">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...tags, ...tags, ...tags, ...tags].map((tag, i) => (
          <span
            key={i}
            className="mx-3 px-5 py-2.5 bg-section-light text-badge-foreground rounded-full text-sm font-medium shrink-0"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
};

export default MarqueeStrip;
