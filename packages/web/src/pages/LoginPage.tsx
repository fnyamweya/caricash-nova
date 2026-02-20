import { useNavigate } from "react-router-dom";

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="card">
        <h1>CariCash Nova</h1>
        <p>Select your login type</p>
        <div className="button-group">
          <button onClick={() => navigate("/login/customer")}>Customer</button>
          <button onClick={() => navigate("/login/agent")}>Agent</button>
          <button onClick={() => navigate("/login/merchant")}>Merchant</button>
          <button onClick={() => navigate("/login/staff")}>Staff</button>
        </div>
      </div>
    </div>
  );
}
