import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { describeLoginError, login, persistLoginSession } from "@billbull/shared/api/auth";
import { useCompany } from "@billbull/shared/context/CompanyContext";
import { Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, X } from "lucide-react";
import toast from "react-hot-toast";
import billBullLogo from "@billbull/shared/assets/billBullLogo.png";
import { clientConfig } from "../config/clientConfig";

const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

// Bottom-right welcome card shown once after a successful sign-in. The Toaster
// lives in App.jsx outside <Routes>, so it survives the redirect to the landing page.
const showLoginSuccessToast = (name) => {
  const displayName = String(name || "").trim() || "there";
  toast.custom(
    (t) => (
      <div
        role="status"
        data-login-toast
        className={`pointer-events-auto flex w-90 max-w-[calc(100vw-32px)] items-start gap-3 rounded-2xl border border-[#FDE6A9] bg-white p-4 shadow-xl`}
        style={{
          opacity: t.visible ? 1 : 0,
          animation: t.visible
            ? "bbLoginToastPopIn 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both"
            : "bbLoginToastPopOut 220ms ease-in both",
        }}
      >
        <style>{`
          @keyframes bbLoginToastPopIn {
            0%   { opacity: 0; transform: translateY(24px) scale(0.85); }
            60%  { opacity: 1; transform: translateY(-4px) scale(1.03); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes bbLoginToastPopOut {
            0%   { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(16px) scale(0.9); }
          }
          @keyframes bbLoginToastCheck {
            0%   { transform: scale(0) rotate(-45deg); }
            70%  { transform: scale(1.25) rotate(8deg); }
            100% { transform: scale(1) rotate(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-login-toast], [data-login-toast] * { animation-duration: 1ms !important; }
          }
        `}</style>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2
            className="h-6 w-6 text-emerald-600"
            style={{ animation: "bbLoginToastCheck 480ms cubic-bezier(0.34, 1.56, 0.64, 1) 180ms both" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1C2838]">Login successful</p>
          <p className="mt-0.5 text-sm leading-snug text-[#66737F] [overflow-wrap:anywhere]">
            {greetingForNow()}, welcome back{" "}
            <span className="font-medium text-[#1C2838]">{displayName}</span> 👋
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => toast.dismiss(t.id)}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ),
    { id: "login-success", position: "bottom-right", duration: 4000 },
  );
};

const Login = () => {
  const navigate = useNavigate();
  const { refreshCompany } = useCompany();

  // --- STATE (FIXED) ---
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // --- HANDLERS ---
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      setError("Please enter username and password");
      return;
    }

    setIsLoading(true);

    try {
      // ✅ BACKEND-ALIGNED LOGIN
      const data = await login(formData.username, formData.password);

      // ✅ Store Auth Data
      persistLoginSession(data);

      // Every login starts with the sidebar collapsed, regardless of how the
      // previous session left it. Toggling it during the session still persists.
      localStorage.setItem("sidebarCollapsed", "true");

      refreshCompany();
      // Tell BranchProvider to reload — it mounted before the token existed
      // and otherwise won't refresh until next full page reload.
      window.dispatchEvent(new CustomEvent('billbull:login'));

      // Redirect based on primary role
      const roleRedirects = {
        SALES:             "/customers",
        INVENTORY_MANAGER: "/inventory/products",
        ACCOUNTANT:        "/financials/ledger",
        HR:                "/payroll/employees",
        DELIVERY_PERSON:   "/sales/pos",
        ADMIN:             "/dashboard",
      };
      const primaryRole = data.primaryRole || data.role;
      showLoginSuccessToast(data.fullName || data.username);
      navigate(clientConfig.landing.defaultRoute || roleRedirects[primaryRole] || "/");
    } catch (err) {
      console.error(err);
      setError(describeLoginError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1C2838]">
      {/* LEFT BRAND PANEL */}
      <div className="relative hidden w-150 flex-col items-center justify-center bg-white px-16 lg:flex">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex flex-col items-center justify-center gap-4">
            <img
              src={billBullLogo}
              alt="BillBull Logo"
              className="w-100 h-auto"
            />
            <h1 className="text-4xl font-bold text-[#1C2838]">
              Enterprise OS
            </h1>
          </div>

          <p className="text-xl text-[#1C2838]">
            Smart Billing • Smart Inventory • Smart Retail
          </p>

          <div className="mt-12 flex gap-3">
            <div className="h-1.5 w-12 rounded-full bg-[#F5C742]" />
            <div className="h-1.5 w-8 rounded-full bg-[#F5C742]/60" />
            <div className="h-1.5 w-4 rounded-full bg-[#F5C742]/30" />
          </div>
        </div>

        <div className="absolute bottom-12 text-sm text-gray-500">
          © {new Date().getFullYear()} BillBull. All rights reserved.
        </div>
      </div>

      {/* RIGHT LOGIN PANEL */}
      <div className="flex flex-1 items-center justify-center bg-[#F7F7FA] px-6 lg:px-20">
        <div className="w-full max-w-120">
          <div className="rounded-3xl bg-white p-8 lg:p-10 shadow-xl border border-gray-100">
            <div className="mb-8 text-center">
              <h2 className="text-[28px] font-semibold text-[#26333C] mb-2">
                Sign in to BillBull
              </h2>
              <p className="text-[16px] text-[#66737F]">
                Enter your credentials to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#333333]">
                  Email or Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-[16px] text-gray-900 placeholder-gray-400 focus:border-[#F5C742] focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 transition-all"
                  placeholder="admin"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#333333]">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 pr-12 text-[16px] text-gray-900 placeholder-gray-400 focus:border-[#F5C742] focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 rounded-xl bg-[#F5C742] text-[18px] font-bold text-[#1A1A1A] shadow-lg hover:bg-[#E5B732] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    Sign In <ArrowRight size={20} />
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-[#405A8C] hover:text-[#2F4570]"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
