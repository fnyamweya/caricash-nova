import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBalance, type BalanceResult } from "../lib/api";
import { useAuth } from "../lib/auth";

export function BalancePage() {
  const navigate = useNavigate();
  const { auth, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    if (auth) {
      getBalance(auth.actor_type, auth.actor_id, "BBD")
        .then(setBalance)
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Failed to load balance",
          ),
        );
    }
  }, [auth, isAuthenticated, navigate]);

  return (
    <div className="page">
      <div className="card">
        <h2>Balance Details</h2>
        {error && <p className="error">{error}</p>}
        {balance ? (
          <div className="balance-card">
            <p>
              <strong>Currency:</strong> {balance.currency}
            </p>
            <p>
              <strong>Balance:</strong> ${balance.balance}
            </p>
          </div>
        ) : (
          !error && <p>Loading…</p>
        )}
        <button onClick={() => navigate("/dashboard")}>← Back</button>
      </div>
    </div>
  );
}
