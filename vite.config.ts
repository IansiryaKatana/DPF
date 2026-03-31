import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
const allowPayPalPopupsHeaders = {
  // PayPal Smart Buttons / card funding open a helper window; strict COOP breaks this.
  // https://developer.paypal.com/sdk/js/best-practices
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  // Allows Payment Request API where the host supports it (some embedded browsers still block payment).
  "Permissions-Policy": "payment=(self)",
};

export default defineConfig(({ mode }) => ({
  appType: "spa",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: allowPayPalPopupsHeaders,
  },
  preview: {
    headers: allowPayPalPopupsHeaders,
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
