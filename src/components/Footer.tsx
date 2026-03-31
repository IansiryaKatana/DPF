import { Link } from "react-router-dom";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border py-10 px-4 md:px-6 w-full">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="3" width="6" height="12" rx="1" fill="hsl(var(--primary-foreground))" />
              <rect x="10" y="6" width="6" height="9" rx="1" fill="hsl(var(--primary-foreground))" opacity="0.7" />
            </svg>
          </div>
          <span className="text-lg font-serif-display text-foreground">DataPulseFlow</span>
        </div>
        <p className="text-xs text-muted-foreground">© {currentYear} DataPulseFlow. All rights reserved.</p>
        <div className="flex gap-6">
          <Link to="/privacy-policy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms-of-service" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
          <a href="https://datapulseflow.com" className="text-xs text-muted-foreground hover:text-foreground transition-colors" target="_blank" rel="noreferrer">datapulseflow.com</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
