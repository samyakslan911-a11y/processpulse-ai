"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/analyze");
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setError("Revisa tu email para confirmar la cuenta, o inicia sesión si ya la confirmaste.");
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 400, margin: "60px auto" }}>
      <p style={{ fontSize: 12, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 4 }}>MÓDULO 03</p>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        <span style={{ color: "#22D3A4" }}>Process</span>Pulse AI
      </h1>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 6, fontFamily: "monospace", letterSpacing: 1 }}>EMAIL</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ width: "100%", background: "#0D1629", border: "1px solid #1A2744", borderRadius: 8, padding: "10px 12px", color: "#F0F6FF", fontSize: 14, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 6, fontFamily: "monospace", letterSpacing: 1 }}>CONTRASEÑA</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ width: "100%", background: "#0D1629", border: "1px solid #1A2744", borderRadius: 8, padding: "10px 12px", color: "#F0F6FF", fontSize: 14, boxSizing: "border-box" }}
          />
        </div>
        {error && <p style={{ color: error.includes("Revisa") ? "#22D3A4" : "#EF4444", fontSize: 13, marginBottom: 16 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={loading}
            style={{ flex: 1, background: "#22D3A4", color: "#060D1A", padding: "10px", borderRadius: 8, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            {loading ? "..." : "Iniciar sesión"}
          </button>
          <button type="button" onClick={handleSignup} disabled={loading}
            style={{ flex: 1, background: "#0D1629", color: "#94A3B8", padding: "10px", borderRadius: 8, border: "1px solid #1A2744", cursor: "pointer", fontSize: 14 }}>
            Registrarse
          </button>
        </div>
      </form>
    </div>
  );
}
