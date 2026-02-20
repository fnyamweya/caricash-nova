import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { useAuth } from "../lib/auth";

export function MerchantLoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [storeCode, setStoreCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login("merchant", { store_code: storeCode, pin });
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
        <h2>Merchant Login</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Store Code
            <input
              type="text"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder="Enter store code"
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
