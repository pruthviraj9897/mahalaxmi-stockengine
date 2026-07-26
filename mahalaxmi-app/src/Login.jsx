import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.brandMark}>M</div>
        <h1 style={styles.title}>Mahalaxmi Stock Engine</h1>
        <p style={styles.sub}>Sign in to continue</p>

        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />

        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div style={styles.error}>{error}</div>}

        <button style={styles.button} type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p style={styles.hint}>
          Don't have an account? Ask the owner to add you in Supabase → Authentication → Users.
        </p>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f1420",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    width: 340,
    background: "#171d2b",
    borderRadius: 14,
    padding: "32px 28px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "#4f7cff",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 18,
    marginBottom: 14,
  },
  title: { color: "#fff", fontSize: 18, margin: "0 0 4px" },
  sub: { color: "#8b93a7", fontSize: 13, margin: "0 0 20px" },
  label: { color: "#8b93a7", fontSize: 12, marginBottom: 6, marginTop: 12 },
  input: {
    background: "#0f1420",
    border: "1px solid #2a3142",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
  },
  button: {
    marginTop: 20,
    background: "#4f7cff",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "11px 0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    marginTop: 14,
    background: "rgba(255,80,80,0.1)",
    color: "#ff8080",
    fontSize: 12,
    padding: "8px 10px",
    borderRadius: 6,
  },
  hint: { color: "#5b6377", fontSize: 11, marginTop: 18, textAlign: "center", lineHeight: 1.5 },
};
