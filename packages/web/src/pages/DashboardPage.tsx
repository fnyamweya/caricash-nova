import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBalance, type BalanceResult } from "../lib/api";
import { useAuth } from "../lib/auth";

export function DashboardPage() {
  const navigate = useNavigate();
  const { auth, logout, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [balanceError, setBalanceError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    if (auth) {
      getBalance(auth.actor_type, auth.actor_id, "BBD")
        .then(setBalance)
        .catch((err) =>
          setBalanceError(
            err instanceof Error ? err.message : "Failed to load balance",
          ),
        );
    }
  }, [auth, isAuthenticated, navigate]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Welcome to CariCash Nova</h1>
        {auth && (
          <p className="subtitle">
            {auth.actor_type}: {auth.actor_id}
          </p>
        )}

        <div className="balance-card">
          <h3>Balance (BBD)</h3>
          {balanceError && <p className="error">{balanceError}</p>}
          {balance ? (
            <p className="balance-amount">${balance.balance}</p>
          ) : (
            !balanceError && <p>Loading…</p>
          )}
        </div>

        <div className="events-section">
          <h3>Recent Events</h3>
          <p className="empty">No recent events</p>
        </div>

        <button onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
}
