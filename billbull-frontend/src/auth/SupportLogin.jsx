import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { persistLoginSession } from "@billbull/shared/api/auth";
import { useCompany } from "@billbull/shared/context/CompanyContext";
import { readSupportFragment } from "./supportFragment";

/**
 * /support-login#token=…&expires=… — the link BillBull's control plane opens for a time-boxed
 * support sign-in. The token travels in the URL fragment, which the browser never sends to the
 * server or writes to logs; it is moved into this tab's session and the fragment wiped at once.
 */
export default function SupportLogin() {
  const navigate = useNavigate();
  const { refreshCompany } = useCompany();
  // Read once, on first render, before the effect below wipes the fragment.
  const [found] = useState(() => readSupportFragment(window.location.hash));

  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname); // drop the token from the address bar
    if (!found) return;
    const roles = Array.isArray(found.claims.roles) ? found.claims.roles : [];
    persistLoginSession({
      token: found.token,
      primaryRole: roles[0] || "USER",
      username: found.claims.sub,
      fullName: "BillBull Support",
    });
    sessionStorage.setItem("billbull.supportSession", found.expires || "");
    refreshCompany?.();
    window.dispatchEvent(new CustomEvent("billbull:login"));
    navigate("/dashboard", { replace: true });
  }, [found, navigate, refreshCompany]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF8E7] p-6">
      <div className="max-w-md rounded-lg border border-[#FDE6A9] bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">BillBull support sign-in</h1>
        <p className="mt-2 text-sm text-gray-600">
          {found ? "Signing in…" : "This support link is invalid or has expired. Open a new one from the BillBull control plane."}
        </p>
        {!found && (
          <a href="/login" className="mt-4 inline-block text-sm font-medium text-amber-700 hover:underline">Go to the sign-in page</a>
        )}
      </div>
    </div>
  );
}
