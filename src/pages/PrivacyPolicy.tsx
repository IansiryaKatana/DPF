import { Link } from "react-router-dom";

const PrivacyPolicy = () => {
  return (
    <main className="min-h-screen bg-background px-4 py-12 md:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="space-y-3">
          <Link to="/" className="text-sm text-primary underline underline-offset-4">
            Back to DataPulseFlow
          </Link>
          <h1 className="text-3xl font-semibold text-foreground md:text-4xl">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: March 30, 2026</p>
        </div>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base">
          <p>
            This Privacy Policy explains how DataPulseFlow ("we", "our", or "us") collects, uses, stores, and
            protects personal data when you use our website and services at{" "}
            <a href="https://datapulseflow.com" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
              datapulseflow.com
            </a>
            .
          </p>
          <h2 className="text-xl font-medium text-foreground">Information We Collect</h2>
          <p>
            We may collect account details, business contact information, billing details, service usage data,
            diagnostics, and communication records needed to operate the platform.
          </p>
          <h2 className="text-xl font-medium text-foreground">How We Use Information</h2>
          <p>
            We use data to provide and improve DataPulseFlow services, process billing, support integrations, secure
            the platform, and communicate product or account updates.
          </p>
          <h2 className="text-xl font-medium text-foreground">Cookies</h2>
          <p>
            We use essential cookies to keep the website functional and secure. Optional cookies may be used for
            analytics and service improvements only when consent is provided.
          </p>
          <h2 className="text-xl font-medium text-foreground">Data Sharing</h2>
          <p>
            We do not sell personal data. We may share data with trusted infrastructure, analytics, payment, and email
            providers only as required to deliver our services and legal obligations.
          </p>
          <h2 className="text-xl font-medium text-foreground">Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may request access, correction, deletion, objection, portability, or
            restriction of processing for your personal data.
          </p>
          <h2 className="text-xl font-medium text-foreground">Contact</h2>
          <p>
            For privacy requests, contact{" "}
            <a href="mailto:privacy@datapulseflow.com" className="text-primary underline underline-offset-4">
              privacy@datapulseflow.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
};

export default PrivacyPolicy;
