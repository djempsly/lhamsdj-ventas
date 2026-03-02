"use client";
import { useState } from "react";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setError("Complete todos los campos");
      return;
    }
    if (trimmedUser.length > 150 || password.length > 128) {
      setError("Datos invalidos");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/login/`, {
        method: "POST",
        credentials: "include", // Receive httpOnly cookies from backend
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUser, password }),
      });
      const data = await res.json();

      if (res.ok) {
        // Only store non-sensitive display data (tokens are in httpOnly cookies)
        if (data.usuario) {
          localStorage.setItem("usuario", JSON.stringify(data.usuario));
        }
        window.location.href = "/dashboard";
      } else if (res.status === 429) {
        setError(data.detail || "Demasiados intentos. Espere unos minutos.");
      } else {
        setError(data.detail || "Usuario o contrasena incorrectos");
      }
    } catch {
      setError("Error de conexion con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #03080f; font-family: 'DM Sans', sans-serif; min-height: 100vh; overflow: hidden; }

        .login-root {
          min-height: 100vh;
          display: flex;
          background: #03080f;
          position: relative;
          overflow: hidden;
        }

        .grid-pattern {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(30,90,160,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,90,160,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        .bg-orb {
          position: absolute; border-radius: 50%;
          filter: blur(100px); pointer-events: none;
          animation: floatOrb 10s ease-in-out infinite;
        }
        .orb1 { width:600px; height:600px; background:radial-gradient(circle,rgba(20,80,160,0.18) 0%,transparent 70%); top:-150px; left:-150px; animation-delay:0s; }
        .orb2 { width:400px; height:400px; background:radial-gradient(circle,rgba(56,189,248,0.1) 0%,transparent 70%); bottom:-100px; right:350px; animation-delay:-4s; }
        .orb3 { width:300px; height:300px; background:radial-gradient(circle,rgba(14,100,200,0.08) 0%,transparent 70%); top:50%; right:80px; animation-delay:-7s; }

        @keyframes floatOrb {
          0%,100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-40px) scale(1.08); }
        }

        /* LEFT PANEL */
        .left-panel {
          flex: 1; display: flex; flex-direction: column;
          justify-content: center; padding: 60px 80px;
          position: relative; z-index: 10;
        }

        .logo-area {
          display: flex; align-items: center; gap: 16px;
          margin-bottom: 56px;
        }
        .logo-img {
          width: 80px; height: 80px;
          object-fit: contain;
          filter: drop-shadow(0 0 20px rgba(56,189,248,0.4));
          animation: glowLogo 3s ease-in-out infinite;
        }
        @keyframes glowLogo {
          0%,100% { filter: drop-shadow(0 0 20px rgba(56,189,248,0.4)); }
          50% { filter: drop-shadow(0 0 35px rgba(56,189,248,0.7)); }
        }
        .logo-text { display: flex; flex-direction: column; }
        .logo-name {
          font-family: 'Syne', sans-serif;
          font-size: 28px; font-weight: 800;
          color: #f0f8ff;
          letter-spacing: -0.02em;
        }
        .logo-name span { color: #38bdf8; }
        .logo-tagline {
          font-size: 12px; color: #334155;
          text-transform: uppercase; letter-spacing: 0.12em;
          font-weight: 500;
        }

        .hero-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(32px, 3.5vw, 52px);
          font-weight: 800; line-height: 1.1;
          color: #e2eaf5; margin-bottom: 20px;
        }
        .hero-title .gradient-text {
          background: linear-gradient(135deg, #38bdf8 0%, #1d4ed8 50%, #7c3aed 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-desc {
          font-size: 15px; color: #475569;
          line-height: 1.75; max-width: 400px; margin-bottom: 52px;
        }

        .features { display: flex; flex-direction: column; gap: 14px; }
        .feature-item { display: flex; align-items: center; gap: 14px; }
        .feature-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: linear-gradient(135deg, #38bdf8, #1d4ed8);
          box-shadow: 0 0 10px rgba(56,189,248,0.5);
          flex-shrink: 0;
        }
        .feature-text { font-size: 14px; color: #64748b; }

        /* DIVIDER */
        .panel-divider {
          width: 1px;
          background: linear-gradient(to bottom, transparent, rgba(56,189,248,0.15), transparent);
          position: relative; z-index: 10; margin: 40px 0;
        }

        /* RIGHT PANEL */
        .right-panel {
          width: 460px; display: flex;
          align-items: center; justify-content: center;
          padding: 40px; position: relative; z-index: 10;
        }

        .form-card {
          width: 100%;
          background: rgba(10,18,35,0.85);
          border: 1px solid rgba(56,189,248,0.08);
          border-radius: 28px; padding: 48px 40px;
          backdrop-filter: blur(24px);
          box-shadow: 0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(56,189,248,0.06);
          animation: cardIn 0.7s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes cardIn {
          from { opacity:0; transform: translateY(40px) scale(0.97); }
          to { opacity:1; transform: translateY(0) scale(1); }
        }

        .card-logo {
          width: 60px; height: 60px;
          object-fit: contain; margin-bottom: 24px;
          filter: drop-shadow(0 0 16px rgba(56,189,248,0.5));
        }

        .form-title {
          font-family: 'Syne', sans-serif;
          font-size: 24px; font-weight: 700;
          color: #e2eaf5; margin-bottom: 6px;
        }
        .form-subtitle { font-size: 13px; color: #334155; margin-bottom: 36px; }

        .form-group { margin-bottom: 18px; }
        .form-label {
          display: block; font-size: 11px; font-weight: 600;
          color: #475569; text-transform: uppercase;
          letter-spacing: 0.1em; margin-bottom: 8px;
        }
        .input-wrap { position: relative; }
        .form-input {
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; padding: 13px 16px 13px 42px;
          font-size: 14px; color: #cbd5e1;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.25s; outline: none;
        }
        .form-input::placeholder { color: #1e293b; }
        .form-input:focus {
          border-color: rgba(56,189,248,0.35);
          background: rgba(56,189,248,0.04);
          box-shadow: 0 0 0 3px rgba(56,189,248,0.07);
          color: #e2eaf5;
        }
        .input-icon {
          position: absolute; left: 13px; top: 50%;
          transform: translateY(-50%);
          color: #1e3a5f; font-size: 15px;
          pointer-events: none;
        }
        .eye-btn {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          color: #1e3a5f; cursor: pointer; font-size: 14px;
          padding: 4px; transition: color 0.2s;
        }
        .eye-btn:hover { color: #38bdf8; }

        .error-box {
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.18);
          border-radius: 10px; padding: 11px 14px;
          font-size: 13px; color: #fca5a5;
          margin-bottom: 18px; display: flex;
          align-items: center; gap: 8px;
        }

        .btn-submit {
          width: 100%;
          background: linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%);
          border: none; border-radius: 12px;
          padding: 14px; font-size: 15px;
          font-weight: 700; font-family: 'Syne', sans-serif;
          color: white; cursor: pointer;
          transition: all 0.25s; margin-top: 8px;
          box-shadow: 0 4px 24px rgba(14,165,233,0.25);
          letter-spacing: 0.03em;
        }
        .btn-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(14,165,233,0.4);
        }
        .btn-submit:disabled { opacity: 0.65; cursor: not-allowed; }

        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.25);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 8px; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .footer-text {
          text-align: center; margin-top: 28px;
          font-size: 11px; color: #0f172a;
          letter-spacing: 0.05em;
        }

        @media (max-width: 900px) {
          .left-panel, .panel-divider { display: none; }
          .right-panel { width: 100%; }
        }
      `}</style>

      <div className="login-root">
        <div className="grid-pattern" />
        <div className="bg-orb orb1" />
        <div className="bg-orb orb2" />
        <div className="bg-orb orb3" />

        {/* LEFT */}
        <div className="left-panel">
          <div className="logo-area">
            <Image src="/logo.png" alt="L'hams DJ Logo" width={80} height={80} className="logo-img" priority />
            <div className="logo-text">
              <div className="logo-name">Lhams-<span>DJ</span></div>
              <div className="logo-tagline">Sistema de Ventas</div>
            </div>
          </div>

          <h1 className="hero-title">
            Control total<br />de tu <span className="gradient-text">negocio</span>
          </h1>

          <p className="hero-desc">
            Gestiona ventas, inventario y contabilidad con inteligencia artificial.
            Diseñado para superar a Alegra y los mejores sistemas del mercado.
          </p>

          <div className="features">
            {[
              "Punto de venta ultrarapido con busqueda instantanea",
              "Dashboard con analisis AI en tiempo real",
              "Facturacion electronica DGII integrada",
              "Motor contable completo con reportes financieros",
              "Seguridad empresarial con auditoria de acciones",
            ].map((f, i) => (
              <div className="feature-item" key={i}>
                <div className="feature-dot" />
                <span className="feature-text">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-divider" />

        {/* RIGHT */}
        <div className="right-panel">
          <div className="form-card">
            <Image src="/logo.png" alt="Logo" width={60} height={60} className="card-logo" priority />
            <h2 className="form-title">Iniciar Sesion</h2>
            <p className="form-subtitle">Accede a tu panel de control</p>

            <form onSubmit={handleLogin}>
              {error && (
                <div className="error-box">
                  <span>!</span> <span>{String(error).substring(0, 200)}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Usuario</label>
                <div className="input-wrap">
                  <span className="input-icon">U</span>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Escribe tu usuario"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    maxLength={150}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Contrasena</label>
                <div className="input-wrap">
                  <span className="input-icon">K</span>
                  <input
                    className="form-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Escribe tu contrasena"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    maxLength={128}
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? "x" : "o"}
                  </button>
                </div>
              </div>

              <button className="btn-submit" type="submit" disabled={loading}>
                {loading
                  ? <><span className="spinner" />Verificando...</>
                  : "Entrar al Sistema"
                }
              </button>
            </form>

            <p className="footer-text">&copy; 2026 L&apos;hams DJ - Todos los derechos reservados</p>
          </div>
        </div>
      </div>
    </>
  );
}
