import { Link } from "react-router-dom";

const TermsOfService = () => {
  return (
    <main className="min-h-screen bg-background px-4 py-12 md:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="space-y-3">
          <Link to="/" className="text-sm text-primary underline underline-offset-4">
            Back to DataPulseFlow
          </Link>
          <h1 className="text-3xl font-semibold text-foreground md:text-4xl">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: March 30, 2026</p>
        </div>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base">
          <p>
            These Terms of Service govern access to and use of DataPulseFlow services, including the website at{" "}
            <a href="https://datapulseflow.com" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
              datapulseflow.com
            </a>
            . By accessing or using the services, you agree to these terms.
          </p>
          <h2 className="text-xl font-medium text-foreground">Company and Contracting Entity</h2>
          <p>
            Unless a signed order form or master services agreement states otherwise, these terms are entered into
            between you and DataPulseFlow (the "Company"). The applicable contracting entity details are provided in
            commercial documents issued for your account (including signed order forms and invoices).
          </p>
          <h2 className="text-xl font-medium text-foreground">Service Use</h2>
          <p>
            You may use the services only for lawful business purposes, in accordance with applicable laws, and with
            appropriate account security controls. You are responsible for activity under your account credentials.
          </p>
          <h2 className="text-xl font-medium text-foreground">Subscriptions and Billing</h2>
          <p>
            Paid plans are billed according to your selected plan and billing cycle. You authorize DataPulseFlow to
            charge applicable fees and taxes to your designated payment method. Unless otherwise stated in a signed
            agreement, fees are non-refundable once the billed service period begins.
          </p>
          <h2 className="text-xl font-medium text-foreground">Data Processing and Subprocessors</h2>
          <p>
            Where DataPulseFlow processes personal data on your behalf, the parties will rely on the applicable data
            processing terms in your contract (including a DPA where required). DataPulseFlow may use vetted
            subprocessors for infrastructure, payment processing, communications, and monitoring, subject to
            confidentiality and security obligations consistent with applicable law.
          </p>
          <h2 className="text-xl font-medium text-foreground">Security and Incident Notification</h2>
          <p>
            DataPulseFlow implements technical and organizational safeguards appropriate to the nature of the services.
            If DataPulseFlow confirms a security incident materially affecting your customer data, notice will be
            provided without undue delay and in line with applicable legal and contractual requirements.
          </p>
          <h2 className="text-xl font-medium text-foreground">Intellectual Property</h2>
          <p>
            All platform software, branding, and related content remain the property of DataPulseFlow or its licensors.
            No ownership rights are transferred through service use.
          </p>
          <h2 className="text-xl font-medium text-foreground">Availability and Changes</h2>
          <p>
            We may update, improve, or discontinue features as part of normal service operations. Any service-level
            commitments apply only if explicitly defined in your signed commercial agreement.
          </p>
          <h2 className="text-xl font-medium text-foreground">Data Retention and Deletion</h2>
          <p>
            During an active subscription, customer account data is retained to provide the services. After account
            termination, data is retained for a limited operational, legal, and security period, then deleted or
            anonymized according to DataPulseFlow retention standards and applicable law unless otherwise required.
          </p>
          <h2 className="text-xl font-medium text-foreground">Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, DataPulseFlow is not liable for indirect, incidental, or
            consequential damages arising from service use.
          </p>
          <h2 className="text-xl font-medium text-foreground">Governing Law and Dispute Resolution</h2>
          <p>
            Governing law and dispute venue are defined in your signed order form, master services agreement, or other
            executed commercial terms with DataPulseFlow. If those documents are silent, disputes will be resolved in a
            commercially reasonable venue permitted by applicable law.
          </p>
          <h2 className="text-xl font-medium text-foreground">Contact</h2>
          <p>
            For legal or contract questions, contact{" "}
            <a href="mailto:legal@datapulseflow.com" className="text-primary underline underline-offset-4">
              Legal@datapulseflow.com
            </a>
            . For general support matters, contact{" "}
            <a href="mailto:support@datapulseflow.com" className="text-primary underline underline-offset-4">
              Support@datapulseflow.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
};

export default TermsOfService;
