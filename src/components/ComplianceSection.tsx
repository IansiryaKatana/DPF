import { ShieldCheck } from "lucide-react";

const items = [
  "HMAC-verified webhook signatures for every incoming event",
  "Encrypted credential storage with admin-only access controls",
  "Automatic token rotation and lifecycle management",
  "Idempotent event processing — no duplicate data, ever",
  "Full audit trail for every sync and webhook event",
  "Role-based permissions safeguarding operational actions",
];

const ComplianceSection = () => {
  return (
    <section className="py-16 md:py-20 px-4 md:px-6 w-full">
      <div className="w-full max-w-[1600px] mx-auto">
        <p className="text-sm font-medium text-muted-foreground mb-2">Security & reliability</p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif-display text-foreground mb-10">
          Enterprise-grade protection
        </h2>

        <div className="overflow-hidden">
          <div className="flex animate-marquee-reverse gap-4">
            {[...items, ...items].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-card border border-border rounded-2xl p-5 md:p-6 min-w-[280px] md:min-w-[320px] shrink-0"
              >
                <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-foreground leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ComplianceSection;
