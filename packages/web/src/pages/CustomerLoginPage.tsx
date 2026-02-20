import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { useAuth } from "../lib/auth";

export function CustomerLoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [msisdn, setMsisdn] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login("customer", { msisdn, pin });
      setAuth(result);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Customer Login</h2>
        <form onSubmit={handleSubmit}>
          <label>
            MSISDN
            <input
              type="tel"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
              placeholder="+1246..."
              required
            />
          </label>
          <label>
            PIN
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <button className="link" onClick={() => navigate("/login")}>
          ← Back
        </button>
      </div>
    </div>
  );
}
