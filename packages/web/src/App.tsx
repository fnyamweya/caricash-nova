import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { CustomerLoginPage } from "./pages/CustomerLoginPage";
import { AgentLoginPage } from "./pages/AgentLoginPage";
import { MerchantLoginPage } from "./pages/MerchantLoginPage";
import { StaffLoginPage } from "./pages/StaffLoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BalancePage } from "./pages/BalancePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/customer" element={<CustomerLoginPage />} />
        <Route path="/login/agent" element={<AgentLoginPage />} />
        <Route path="/login/merchant" element={<MerchantLoginPage />} />
        <Route path="/login/staff" element={<StaffLoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/balance" element={<BalancePage />} />
      </Routes>
    </BrowserRouter>
  );
}
