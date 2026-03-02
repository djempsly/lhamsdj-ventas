"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Producto {
  id: string;
  codigo_barras: string;
  nombre: string;
  precio_costo: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  categoria_nombre: string;
  activo: boolean;
  ganancia: number;
  margen: number;
}

interface Categoria {
  id: string;
  nombre: string;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: "", codigo_barras: "", precio_costo: "", precio_venta: "",
    stock_actual: "", stock_minimo: "", categoria: "", unidad_medida: "UNIDAD",
    aplica_impuesto: true, tasa_impuesto: "18"
  });

  useEffect(() => {
    setMounted(true);
    const temaGuardado = localStorage.getItem("tema");
    if (temaGuardado) {
      try { setTema(JSON.parse(temaGuardado)); } catch { /* use default */ }
    }
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.get("/productos/"),
        api.get("/categorias/")
      ]);
      if (pRes?.ok) { const d = await pRes.json(); setProductos(Array.isArray(d) ? d : d.results || []); }
      if (cRes?.ok) { const d = await cRes.json(); setCategorias(Array.isArray(d) ? d : d.results || []); }
    } catch {
      // Handled by interceptor
    }
    setLoading(false);
  };

  // --- Input Validation ---
  const validateForm = (): string | null => {
    const nombre = form.nombre.trim();
    if (!nombre) return "El nombre del producto es requerido.";
    if (nombre.length > 200) return "El nombre es muy largo (max 200 caracteres).";

    const costo = parseFloat(form.precio_costo);
    const venta = parseFloat(form.precio_venta);
    const stock = parseFloat(form.stock_actual);
    const stockMin = parseFloat(form.stock_minimo);

    if (isNaN(costo) || costo < 0) return "Precio de costo invalido.";
    if (isNaN(venta) || venta <= 0) return "Precio de venta debe ser mayor a 0.";
    if (venta < costo) return "Precio de venta no puede ser menor al costo.";
    if (isNaN(stock) || stock < 0) return "Stock actual invalido.";
    if (isNaN(stockMin) || stockMin < 0) return "Stock minimo invalido.";
    if (costo > 99999999 || venta > 99999999) return "Precio fuera de rango permitido.";

    return null;
  };

  const guardarProducto = async () => {
    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError("");
    setSaving(true);

    try {
      const data = {
        codigo_barras: form.codigo_barras.trim() || `PROD-${Date.now()}`,
        nombre: form.nombre.trim(),
        precio_costo: parseFloat(form.precio_costo),
        precio_venta: parseFloat(form.precio_venta),
        stock_actual: parseFloat(form.stock_actual),
        stock_minimo: parseFloat(form.stock_minimo),
        categoria: form.categoria || null,
        unidad_medida: form.unidad_medida,
        aplica_impuesto: form.aplica_impuesto,
        tasa_impuesto: parseFloat(form.tasa_impuesto),
      };
      const res = editando
        ? await api.put(`/productos/${editando.id}/`, data)
        : await api.post("/productos/", data);

      if (res?.ok) {
        setShowModal(false);
        setEditando(null);
        resetForm();
        cargarDatos();
      } else {
        const errorData = await res?.json().catch(() => ({}));
        const msg = typeof errorData === 'object'
          ? Object.values(errorData).flat().join('. ')
          : 'Error al guardar';
        setFormError(String(msg).substring(0, 200));
      }
    } catch {
      setFormError("Error de conexion. Intente nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const eliminarProducto = async (id: string) => {
    if (!confirm("Desactivar este producto?")) return;
    await api.patch(`/productos/${id}/`, { activo: false });
    cargarDatos();
  };

  const resetForm = () => {
    setForm({
      nombre: "", codigo_barras: "", precio_costo: "", precio_venta: "",
      stock_actual: "", stock_minimo: "", categoria: "", unidad_medida: "UNIDAD",
      aplica_impuesto: true, tasa_impuesto: "18"
    });
    setFormError("");
  };

  const abrirEditar = (p: Producto) => {
    setEditando(p);
    setForm({
      nombre: p.nombre, codigo_barras: p.codigo_barras,
      precio_costo: String(p.precio_costo), precio_venta: String(p.precio_venta),
      stock_actual: String(p.stock_actual), stock_minimo: String(p.stock_minimo),
      categoria: "", unidad_medida: "UNIDAD", aplica_impuesto: true, tasa_impuesto: "18"
    });
    setFormError("");
    setShowModal(true);
  };

  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo_barras.toLowerCase().includes(busqueda.toLowerCase())
  );

  const esClaro = tema.texto === "#0f172a";

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:${tema.bg}; font-family:'DM Sans',sans-serif; }
        .page { min-height:100vh; background:${tema.bg}; color:${tema.texto}; padding:32px; }
        .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:16px; }
        .header-left { display:flex; align-items:center; gap:16px; }
        .back-btn {
          background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:10px; padding:8px 16px; color:${tema.subtexto};
          font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif;
        }
        .back-btn:hover { color:${tema.accent}; border-color:${tema.accent}40; }
        .page-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; color:${tema.texto}; }
        .page-title span { color:${tema.accent}; }
        .toolbar { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
        .search-input {
          flex:1; min-width:200px; background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:10px; padding:10px 16px; color:${tema.texto}; font-size:14px;
          font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s;
        }
        .search-input::placeholder { color:${tema.subtexto}; }
        .search-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .btn-primary {
          background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent});
          border:none; border-radius:10px; padding:10px 20px;
          color:white; font-size:14px; font-weight:600; cursor:pointer;
          transition:all 0.2s; font-family:'Syne',sans-serif; white-space:nowrap;
          box-shadow:0 4px 16px ${tema.accent}30;
        }
        .btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 24px ${tema.accent}40; }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat {
          background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:12px; padding:16px 20px; flex:1; min-width:140px;
          box-shadow:${esClaro ? "0 2px 8px rgba(0,0,0,0.06)" : "none"};
        }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:${tema.texto}; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .table-wrap {
          background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:16px; overflow:hidden;
          box-shadow:${esClaro ? "0 4px 16px rgba(0,0,0,0.07)" : "none"};
        }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}; }
        th {
          padding:12px 16px; text-align:left; font-size:11px; font-weight:600;
          color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em;
          border-bottom:1px solid ${tema.borde};
        }
        td { padding:14px 16px; font-size:14px; color:${tema.texto}; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:11px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .action-btn {
          background:none; border:1px solid ${tema.borde}; border-radius:8px;
          padding:5px 10px; font-size:12px; cursor:pointer; transition:all 0.2s;
          font-family:'DM Sans',sans-serif; color:${tema.subtexto}; margin-right:4px;
        }
        .action-btn:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .action-btn.del:hover { border-color:rgba(239,68,68,0.4); color:#ef4444; }
        .modal-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.7);
          display:flex; align-items:center; justify-content:center;
          z-index:1000; backdrop-filter:blur(4px);
        }
        .modal {
          background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde};
          border-radius:20px; padding:36px; width:100%; max-width:520px;
          max-height:90vh; overflow-y:auto;
          box-shadow:0 30px 60px rgba(0,0,0,0.4);
        }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; color:${tema.texto}; margin-bottom:24px; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input {
          background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"};
          border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px;
          font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif;
          outline:none; transition:all 0.2s;
        }
        .form-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel {
          background:none; border:1px solid ${tema.borde}; border-radius:10px;
          padding:10px 20px; color:${tema.subtexto}; font-size:14px;
          cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s;
        }
        .btn-cancel:hover { border-color:${tema.accent}40; color:${tema.texto}; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .empty-icon { font-size:48px; margin-bottom:12px; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .form-error {
          background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18);
          border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5;
          margin-bottom:16px; grid-column:1/-1;
        }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Inventario</span> / Productos</h1>
          </div>
          <button className="btn-primary" onClick={() => { resetForm(); setEditando(null); setShowModal(true); }}>
            + Nuevo Producto
          </button>
        </div>

        <div className="stats-row">
          {[
            { val: productos.length, label: "Total productos" },
            { val: productos.filter(p => p.stock_actual <= p.stock_minimo).length, label: "Stock bajo" },
            { val: categorias.length, label: "Categorias" },
            { val: `RD$${productos.reduce((a,p) => a + (p.stock_actual * p.precio_costo), 0).toLocaleString("es-DO",{minimumFractionDigits:2})}`, label: "Valor inventario" },
          ].map((s,i) => (
            <div className="mini-stat" key={i}>
              <div className="mini-stat-val">{s.val}</div>
              <div className="mini-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Buscar por nombre o codigo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value.substring(0, 100))}
            maxLength={100}
          />
          <button className="btn-primary" onClick={() => { resetForm(); setEditando(null); setShowModal(true); }}>
            + Nuevo
          </button>
        </div>

        {loading ? (
          <div className="loading">Cargando productos...</div>
        ) : productosFiltrados.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">INV</div>
            <p>No hay productos aun. Crea el primero!</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Codigo</th><th>Nombre</th><th>Categoria</th>
                  <th>Costo</th><th>Precio</th><th>Margen</th>
                  <th>Stock</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map(p => (
                  <tr key={p.id}>
                    <td style={{fontFamily:"monospace",fontSize:12}}>{p.codigo_barras}</td>
                    <td style={{fontWeight:500}}>{p.nombre}</td>
                    <td>{p.categoria_nombre || "—"}</td>
                    <td>RD${Number(p.precio_costo).toLocaleString("es-DO")}</td>
                    <td style={{color:tema.accent,fontWeight:600}}>RD${Number(p.precio_venta).toLocaleString("es-DO")}</td>
                    <td>
                      <span className={`badge ${Number(p.margen)>=20?"badge-green":Number(p.margen)>=10?"badge-yellow":"badge-red"}`}>
                        {Number(p.margen).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${p.stock_actual>p.stock_minimo?"badge-green":"badge-red"}`}>
                        {p.stock_actual}
                      </span>
                    </td>
                    <td><span className={`badge ${p.activo?"badge-green":"badge-red"}`}>{p.activo?"Activo":"Inactivo"}</span></td>
                    <td>
                      <button className="action-btn" onClick={() => abrirEditar(p)}>Editar</button>
                      <button className="action-btn del" onClick={() => eliminarProducto(p.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editando ? "Editar Producto" : "Nuevo Producto"}</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group full">
                <label className="form-label">Nombre del producto *</label>
                <input className="form-input" placeholder="Ej: Cerveza Presidente" value={form.nombre}
                  onChange={e => setForm({...form,nombre:e.target.value})} maxLength={200} />
              </div>
              <div className="form-group">
                <label className="form-label">Codigo de barras</label>
                <input className="form-input" placeholder="Dejar vacio = auto" value={form.codigo_barras}
                  onChange={e => setForm({...form,codigo_barras:e.target.value})} maxLength={50} />
              </div>
              <div className="form-group">
                <label className="form-label">Categoria</label>
                <select className="form-input" value={form.categoria} onChange={e => setForm({...form,categoria:e.target.value})}>
                  <option value="">Sin categoria</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Precio de costo (RD$) *</label>
                <input className="form-input" type="number" step="0.01" min="0" max="99999999"
                  placeholder="0.00" value={form.precio_costo}
                  onChange={e => setForm({...form,precio_costo:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Precio de venta (RD$) *</label>
                <input className="form-input" type="number" step="0.01" min="0.01" max="99999999"
                  placeholder="0.00" value={form.precio_venta}
                  onChange={e => setForm({...form,precio_venta:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Stock actual *</label>
                <input className="form-input" type="number" step="1" min="0"
                  placeholder="0" value={form.stock_actual}
                  onChange={e => setForm({...form,stock_actual:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Stock minimo</label>
                <input className="form-input" type="number" step="1" min="0"
                  placeholder="5" value={form.stock_minimo}
                  onChange={e => setForm({...form,stock_minimo:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Unidad de medida</label>
                <select className="form-input" value={form.unidad_medida} onChange={e => setForm({...form,unidad_medida:e.target.value})}>
                  <option>UNIDAD</option><option>CAJA</option><option>KG</option>
                  <option>LITRO</option><option>METRO</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarProducto} disabled={saving}>
                {saving ? "Guardando..." : editando ? "Guardar cambios" : "Crear producto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
