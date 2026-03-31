import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type ConsentValue = "accepted" | "rejected";

const STORAGE_KEY = "datapulseflow_cookie_consent";

const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY) as ConsentValue | null;
    setVisible(!consent);
  }, []);

  const handleConsent = (value: ConsentValue) => {
    localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="text-sm text-muted-foreground">
          DataPulseFlow uses cookies to keep the website secure and functional on{" "}
          <a href="https://datapulseflow.com" className="text-primary underline underline-offset-4" target="_blank" rel="noreferrer">
            datapulseflow.com
          </a>
          . You can accept optional cookies or reject them and continue with essential cookies only. See our{" "}
          <Link to="/privacy-policy" className="text-primary underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/terms-of-service" className="text-primary underline underline-offset-4">
            Terms
          </Link>
          .
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleConsent("rejected")}>
            Reject Optional
          </Button>
          <Button size="sm" onClick={() => handleConsent("accepted")}>
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
