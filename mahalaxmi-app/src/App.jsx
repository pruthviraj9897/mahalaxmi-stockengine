import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import StockEngine from "./StockEngine";

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const onLogout = async () => {
    await supabase.auth.signOut();
  };

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Georgia, serif",
          color: "#8a7d6b",
          background: "#faf7f1",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return <StockEngine session={session} onLogout={onLogout} />;
}
