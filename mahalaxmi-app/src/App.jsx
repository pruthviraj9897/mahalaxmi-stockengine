import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import StockEngine from "./StockEngine";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [pendingOtp, setPendingOtp] = useState(false); // true while Login is mid password-check/OTP flow

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1420", color: "#8b93a7", fontFamily: "system-ui, sans-serif" }}>
        Loading…
      </div>
    );
  }

  // signInWithPassword briefly creates a real session before Login signs it
  // back out to continue the OTP step. Don't let that momentary session
  // bounce us over to StockEngine and unmount Login mid-flow.
  if (!session || pendingOtp) return <Login onPendingOtpChange={setPendingOtp} />;

  return <StockEngine session={session} onLogout={handleLogout} />;
}
