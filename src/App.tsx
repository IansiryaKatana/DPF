import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Register from "./pages/Register.tsx";
import Login from "./pages/Login.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Admin from "./pages/Admin.tsx";
import InvoiceView from "./pages/InvoiceView.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.tsx";
import TermsOfService from "./pages/TermsOfService.tsx";
import RealEstateLanding from "./pages/RealEstateLanding.tsx";
import RealEstateDashboard from "./pages/RealEstateDashboard.tsx";
import RealEstateLogin from "./pages/RealEstateLogin.tsx";
import RealEstateRegister from "./pages/RealEstateRegister.tsx";
import RealEstateAdmin from "./pages/RealEstateAdmin.tsx";
import RealEstateInvoiceView from "./pages/RealEstateInvoiceView.tsx";
import CookieConsentBanner from "./components/CookieConsentBanner.tsx";
import SupportChatWidget from "./components/SupportChatWidget.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dataflowwebsite" element={<Index />} />
            <Route path="/real-estate" element={<RealEstateLanding />} />
            <Route path="/dataflowwebsite/real-estate" element={<RealEstateLanding />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/dataflowwebsite/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/dataflowwebsite/terms-of-service" element={<TermsOfService />} />
            <Route path="/register" element={<Register />} />
            <Route path="/register/real-estate" element={<RealEstateRegister />} />
            <Route path="/dataflowwebsite/register/real-estate" element={<RealEstateRegister />} />
            <Route path="/salesportal/register" element={<Register />} />
            <Route path="/salesportal/register/real-estate" element={<RealEstateRegister />} />
            <Route path="/real-estate/login" element={<RealEstateLogin />} />
            <Route path="/real-estate/register" element={<RealEstateRegister />} />
            <Route path="/real-estate/dashboard" element={<RealEstateDashboard />} />
            <Route path="/real-estate/invoice/:id" element={<RealEstateInvoiceView />} />
            <Route path="/real-estate/admin" element={<RealEstateAdmin />} />
            <Route path="/salesportal/real-estate/login" element={<RealEstateLogin />} />
            <Route path="/salesportal/real-estate/register" element={<RealEstateRegister />} />
            <Route path="/salesportal/real-estate/dashboard" element={<RealEstateDashboard />} />
            <Route path="/salesportal/real-estate/invoice/:id" element={<RealEstateInvoiceView />} />
            <Route path="/salesportal/real-estate/admin" element={<RealEstateAdmin />} />
            <Route path="/dataflowwebsite/real-estate/login" element={<RealEstateLogin />} />
            <Route path="/dataflowwebsite/real-estate/register" element={<RealEstateRegister />} />
            <Route path="/login" element={<Login />} />
            <Route path="/salesportal/login" element={<Login />} />
            <Route path="/salesportal" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/salesportal/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/salesportal/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/salesportal/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/real-estate" element={<Navigate to="/real-estate/dashboard" replace />} />
            <Route path="/salesportal/dashboard/real-estate" element={<Navigate to="/real-estate/dashboard" replace />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/salesportal/admin" element={<Admin />} />
            <Route path="/invoice/:id" element={<InvoiceView />} />
            <Route path="/salesportal/invoice/:id" element={<InvoiceView />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <CookieConsentBanner />
          <SupportChatWidget />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
