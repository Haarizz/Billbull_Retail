import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import billBullLogo from "../assets/billBullLogo.png";

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
      sessionStorage.setItem("token", data.token);
      sessionStorage.setItem("role", data.primaryRole || data.role);
      sessionStorage.setItem("primaryRole", data.primaryRole || data.role);
      sessionStorage.setItem("user", data.username);

      refreshCompany();

      // Redirect based on primary role
      const roleRedirects = {
        SALES:             "/customers",
        INVENTORY_MANAGER: "/inventory/products",
        ACCOUNTANT:        "/financials/ledger",
        HR:                "/payroll/employees",
        ADMIN:             "/dashboard",
      };
      const primaryRole = data.primaryRole || data.role;
      navigate(roleRedirects[primaryRole] || "/");
    } catch (err) {
      console.error(err);
      setError("Invalid username or password");
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
