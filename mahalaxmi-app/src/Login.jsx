import { useState, useRef } from "react";
import { Mail, Lock, KeyRound, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "./supabaseClient";

const COLORS = {
  bg: "#faf7f1",
  panel: "#ffffff",
  ink: "#241c14",
  muted: "#8a7d6b",
  border: "#e7ddcd",
  amber: "#b5651d",
  amberDeep: "#8a4413",
  danger: "#b3261e",
};

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30; // seconds

// Temporary toggle: when false, password login is sufficient and the OTP
// step is skipped entirely. Flip back to true to restore two-factor login.
const OTP_ENABLED = false;

export default function Login({ onPendingOtpChange }) {
  const [step, setStep] = useState("credentials"); // "credentials" | "code"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(new Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef([]);
  const cooldownTimer = useRef(null);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN);
    clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownTimer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const checkPasswordAndSendCode = async (e) => {
    e?.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);

    if (!OTP_ENABLED) {
      // OTP temporarily disabled — password alone is enough. Sign in and
      // leave the session in place; App's auth listener picks it up and
      // moves straight past this component, no OTP step needed.
      const { error: pwErr } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      setLoading(false);
      if (pwErr) {
        setError(
          pwErr.message?.toLowerCase().includes("invalid")
            ? "Incorrect email or password."
            : pwErr.message || "Couldn't sign in. Try again."
        );
      }
      return;
    }

    // Tell App to ignore session changes until we're done here — signing in
    // with a password below creates a real session for a moment, and without
    // this flag App would swap to StockEngine and unmount this component
    // before the OTP step even runs.
    onPendingOtpChange?.(true);

    // Step 1: verify the password is correct. This creates a session if it
    // succeeds, but we don't want the user in yet — OTP is still required —
    // so we immediately sign that session back out below.
    const { error: pwErr } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });

    if (pwErr) {
      setLoading(false);
      onPendingOtpChange?.(false);
      setError(
        pwErr.message?.toLowerCase().includes("invalid")
          ? "Incorrect email or password."
          : pwErr.message || "Couldn't sign in. Try again."
      );
      return;
    }

    // Undo the password-only session — OTP still has to happen.
    await supabase.auth.signOut();
    onPendingOtpChange?.(false);

    // Step 2: password was correct, now send the OTP code.
    const { error: sendErr } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (sendErr) {
      setError(sendErr.message || "Couldn't send the code. Try again.");
      return;
    }
    setCode(new Array(CODE_LENGTH).fill(""));
    setStep("code");
    startCooldown();
    setTimeout(() => inputsRef.current[0]?.focus(), 50);
  };

  const resendCode = async () => {
    if (cooldown > 0 || loading) return;
    setError("");
    setLoading(true);
    const { error: sendErr } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (sendErr) {
      setError(sendErr.message || "Couldn't resend the code.");
      return;
    }
    startCooldown();
  };

  const handleDigitChange = (idx, val) => {
    const digit = val.replace(/[^0-9]/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < CODE_LENGTH - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
    if (digit && next.every((d) => d)) {
      verifyCode(next.join(""));
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = new Array(CODE_LENGTH).fill("");
    pasted.split("").forEach((d, i) => (next[i] = d));
    setCode(next);
    const lastIdx = Math.min(pasted.length, CODE_LENGTH) - 1;
    inputsRef.current[lastIdx]?.focus();
    if (pasted.length === CODE_LENGTH) verifyCode(pasted);
  };

  const verifyCode = async (fullCode) => {
    setError("");
    setLoading(true);
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: fullCode,
      type: "email",
    });
    setLoading(false);
    if (verifyErr) {
      setError(
        verifyErr.message?.toLowerCase().includes("expired")
          ? "That code expired. Send a new one."
          : "Incorrect code. Check and try again."
      );
      setCode(new Array(CODE_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    }
    // On success, the auth listener in App.jsx picks up the new session automatically.
  };

  const goBack = () => {
    clearInterval(cooldownTimer.current);
    setStep("credentials");
    setPassword("");
    setCode(new Array(CODE_LENGTH).fill(""));
    setError("");
  };

  return (
    <div style={styles.wrap}>
      <style>{css}</style>
      <div style={styles.card}>
        <div style={styles.brandMark}>M</div>
        <div style={styles.brandName}>Mahalaxmi</div>
        <div style={styles.brandSub}>Stock Engine</div>

        {step === "credentials" && (
          <form onSubmit={checkPasswordAndSendCode} style={styles.form}>
            <div style={styles.stepLabel}>Sign in</div>
            <label style={styles.fieldLabel}>Email address</label>
            <div style={styles.inputWrap}>
              <Mail size={16} color={COLORS.muted} />
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={styles.input}
                disabled={loading}
              />
            </div>
            <label style={styles.fieldLabel}>Password</label>
            <div style={styles.inputWrap}>
              <Lock size={16} color={COLORS.muted} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={styles.input}
                disabled={loading}
              />
            </div>
            {error && (
              <div style={styles.notice}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <button type="submit" style={styles.primaryBtn} disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : <Lock size={16} />}
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        )}

        {step === "code" && (
          <div style={styles.form}>
            <div style={styles.stepLabel}>
              <KeyRound size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Enter the 6-digit code
            </div>
            <div style={styles.hint}>Sent to {email.trim()}</div>
            <div style={styles.codeRow} onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  style={styles.codeBox}
                  disabled={loading}
                />
              ))}
            </div>
            {error && (
              <div style={styles.notice}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <button
              type="button"
              style={styles.primaryBtn}
              disabled={loading || code.some((d) => !d)}
              onClick={() => verifyCode(code.join(""))}
            >
              {loading ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
              {loading ? "Verifying…" : "Verify & log in"}
            </button>
            <div style={styles.rowBetween}>
              <button type="button" style={styles.linkBtn} onClick={goBack} disabled={loading}>
                <ArrowLeft size={13} /> Back to sign in
              </button>
              <button
                type="button"
                style={{ ...styles.linkBtn, opacity: cooldown > 0 ? 0.5 : 1 }}
                onClick={resendCode}
                disabled={loading || cooldown > 0}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const css = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
`;

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: COLORS.bg,
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  card: {
    width: 360,
    maxWidth: "100%",
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: "32px 28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 4px 24px rgba(36,28,20,0.06)",
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: COLORS.amber,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 20,
    fontFamily: "Georgia, serif",
    marginBottom: 10,
  },
  brandName: { fontSize: 17, fontWeight: 700, color: COLORS.ink, fontFamily: "Georgia, serif" },
  brandSub: {
    fontSize: 11,
    color: COLORS.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 22,
  },
  form: { width: "100%", display: "flex", flexDirection: "column", gap: 6 },
  stepLabel: { fontSize: 13.5, fontWeight: 600, color: COLORS.ink, marginBottom: 4 },
  hint: { fontSize: 12, color: COLORS.muted, marginBottom: 10 },
  fieldLabel: { fontSize: 11, color: COLORS.muted, marginBottom: 2 },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 7,
    padding: "9px 11px",
    background: "#fffdf9",
    marginBottom: 6,
  },
  input: {
    border: "none",
    outline: "none",
    fontSize: 13.5,
    flex: 1,
    background: "transparent",
    color: COLORS.ink,
    fontFamily: "system-ui, sans-serif",
  },
  codeRow: { display: "flex", gap: 8, justifyContent: "center", margin: "6px 0 4px" },
  codeBox: {
    width: 40,
    height: 46,
    textAlign: "center",
    fontSize: 20,
    fontWeight: 700,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 7,
    background: "#fffdf9",
    color: COLORS.ink,
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "10px 16px",
    background: COLORS.amber,
    color: "#fff",
    border: "none",
    borderRadius: 7,
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "none",
    color: COLORS.amberDeep,
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 0",
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: COLORS.danger,
    background: "#fbeceb",
    border: "1px solid #f0cfcc",
    borderRadius: 6,
    padding: "7px 9px",
    marginTop: 4,
  },
};
