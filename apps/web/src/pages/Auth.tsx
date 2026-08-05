import React, { useState } from "react";
import { api } from "../api";
import { Nav, useRouter } from "../main";

export function Auth() {
  const { navigate } = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (!email || !password) return setErr("Email and password required.");
    if (mode === "signup" && password.length < 8) return setErr("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "signup") await api.signup(email, password);
      else await api.signin(email, password);
      navigate("/dashboard");
    } catch (e: any) {
      setErr(mode === "signup" ? "Could not sign up — email may already be in use." : "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Nav />
      <div className="auth-wrap">
        <div className="card">
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="sub">{mode === "signin" ? "Sign in to your projects." : "Start building in seconds."}</p>

          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "at least 8 characters" : "••••••••"}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {err && <div className="err">{err}</div>}

          <button className="btn btn-primary" style={{ width: "100%" }} onClick={submit} disabled={busy}>
            {busy ? <span className="spinner" /> : mode === "signin" ? "Sign in" : "Sign up"}
          </button>

          <div className="toggle">
            {mode === "signin" ? (
              <>New here? <a onClick={() => { setMode("signup"); setErr(""); }}>Create an account</a></>
            ) : (
              <>Already have an account? <a onClick={() => { setMode("signin"); setErr(""); }}>Sign in</a></>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
