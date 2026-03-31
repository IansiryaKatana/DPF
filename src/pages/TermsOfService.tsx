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
            These Terms of Service govern your access to and use of DataPulseFlow services, including the website at{" "}
            <a href="https://datapulseflow.com" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
              datapulseflow.com
            </a>
            . By using our services, you agree to these terms.
          </p>
          <h2 className="text-xl font-medium text-foreground">Service Use</h2>
          <p>
            You agree to use DataPulseFlow only for lawful business purposes and to maintain accurate account
            information and proper access controls.
          </p>
          <h2 className="text-xl font-medium text-foreground">Subscriptions and Billing</h2>
          <p>
            Paid plans are billed according to your selected subscription. You authorize DataPulseFlow to charge
            applicable fees and taxes to your chosen payment method.
          </p>
          <h2 className="text-xl font-medium text-foreground">Intellectual Property</h2>
          <p>
            All platform software, branding, and related content remain the property of DataPulseFlow or its licensors.
            No ownership rights are transferred through service use.
          </p>
          <h2 className="text-xl font-medium text-foreground">Availability and Changes</h2>
          <p>
            We may update, improve, or discontinue features as needed. We aim for high availability but do not
            guarantee uninterrupted service.
          </p>
          <h2 className="text-xl font-medium text-foreground">Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, DataPulseFlow is not liable for indirect, incidental, or
            consequential damages arising from service use.
          </p>
          <h2 className="text-xl font-medium text-foreground">Contact</h2>
          <p>
            For legal questions, contact{" "}
            <a href="mailto:legal@datapulseflow.com" className="text-primary underline underline-offset-4">
              legal@datapulseflow.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
};

export default TermsOfService;
