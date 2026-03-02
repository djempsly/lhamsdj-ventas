"use client";
import { useEffect, useState } from "react";
import { comprasService } from "@/services/compras";
import api from "@/lib/axios";

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)",
  texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8",
};

interface Compra {
  id: string; numero: string; proveedor: string; proveedor_nombre: string;
  fecha: string; subtotal: number; total_impuestos: number; total: number;
  estado: string; tipo_bienes_servicios: string; forma_pago: string;
  itbis_retenido: number; retencion_renta: number;
}

export default function ComprasPage() {
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    proveedor: "", almacen: "", ncf_proveedor: "", fecha: new Date().toISOString().split("T")[0],
    tipo_bienes_servicios: "02", forma_pago: "CREDITO", notas: "",
    itbis_retenido: 0, retencion_renta: 0, tipo_retencion: "",
  });
  const [detalles, setDetalles] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    try { const t = localStorage.getItem("tema"); if (t) setTema(JSON.parse(t)); } catch {}
  }, []);

  useEffect(() => { if (mounted) cargarDatos(); }, [mounted]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [c, p, a, pr] = await Promise.all([
        comprasService.getAll(),
        api.get("/proveedores/"),
        api.get("/productos/"),
        api.get("/productos/"),
      ]);
      setCompras(Array.isArray(c.data) ? c.data : c.data.results || []);
      setProveedores(Array.isArray(p.data) ? p.data : p.data.results || []);
      setProductos(Array.isArray(a.data) ? a.data : a.data.results || []);
    } catch {}
    setLoading(false);
  };

  const handleCreate = async () => {
    try {
      await comprasService.create({
        ...form,
        detalles_input: detalles.map((d: any) => ({
          producto: d.producto, cantidad: d.cantidad, precio_unitario: d.precio,
        })),
      });
      setShowModal(false);
      setDetalles([]);
      cargarDatos();
    } catch {}
  };

  const handleRecibir = async (id: string) => {
    try {
      await comprasService.recibir(id);
      cargarDatos();
    } catch {}
  };

  const addDetalle = () => {
    setDetalles([...detalles, { producto: "", cantidad: 1, precio: 0 }]);
  };

  const esClaro = tema.texto === "#0f172a";
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  if (!mounted) return null;

  return (
    <div style={{ minHeight: "100vh", background: tema.bg, color: tema.texto, padding: "24px" }}>
      <style>{`
        .comp-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
        .comp-title{font-size:1.5rem;font-weight:700}
        .comp-btn{padding:10px 20px;border-radius:10px;border:none;font-weight:600;cursor:pointer;
          background:linear-gradient(135deg,${tema.accent},${tema.secondary});color:#fff}
        .comp-btn:hover{opacity:.9;transform:translateY(-1px)}
        .comp-btn-sm{padding:6px 14px;border-radius:8px;border:none;font-weight:500;cursor:pointer;font-size:.8rem}
        .comp-table{width:100%;border-collapse:separate;border-spacing:0;
          background:${tema.card};border-radius:12px;overflow:hidden;border:1px solid ${tema.borde}}
        .comp-table th{padding:12px 16px;text-align:left;font-size:.75rem;text-transform:uppercase;
          letter-spacing:.5px;color:${tema.subtexto};border-bottom:1px solid ${tema.borde}}
        .comp-table td{padding:12px 16px;border-bottom:1px solid ${tema.borde};font-size:.85rem}
        .comp-table tr:hover td{background:${tema.borde}}
        .badge{padding:4px 10px;border-radius:6px;font-size:.75rem;font-weight:600}
        .badge-borrador{background:rgba(234,179,8,.15);color:#eab308}
        .badge-recibida{background:rgba(34,197,94,.15);color:#22c55e}
        .badge-anulada{background:rgba(239,68,68,.15);color:#ef4444}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;
          justify-content:center;z-index:50;backdrop-filter:blur(4px)}
        .modal-content{background:${esClaro ? "#fff" : "#0f1724"};border-radius:16px;padding:28px;
          width:90%;max-width:700px;max-height:85vh;overflow-y:auto;border:1px solid ${tema.borde}}
        .form-group{margin-bottom:14px}
        .form-label{display:block;font-size:.8rem;margin-bottom:4px;color:${tema.subtexto}}
        .form-input{width:100%;padding:10px;border-radius:8px;border:1px solid ${tema.borde};
          background:${esClaro ? "#f8fafc" : "rgba(255,255,255,.05)"};color:${tema.texto};font-size:.9rem}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .det-row{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px}
      `}</style>

      <div className="comp-header">
        <div>
          <div style={{ fontSize: ".85rem", color: tema.subtexto, cursor: "pointer" }}
            onClick={() => (window.location.href = "/dashboard")}>
            ← Volver al Dashboard
          </div>
          <div className="comp-title">Compras</div>
        </div>
        <button className="comp-btn" onClick={() => setShowModal(true)}>+ Nueva Compra</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Cargando...</div>
      ) : (
        <table className="comp-table">
          <thead>
            <tr>
              <th>Número</th><th>Proveedor</th><th>Fecha</th><th>Total</th>
              <th>Retención ITBIS</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.numero}</td>
                <td>{c.proveedor_nombre}</td>
                <td>{c.fecha}</td>
                <td>{fmt(c.total)}</td>
                <td>{fmt(c.itbis_retenido)}</td>
                <td>
                  <span className={`badge badge-${c.estado.toLowerCase()}`}>{c.estado}</span>
                </td>
                <td>
                  {c.estado === "BORRADOR" && (
                    <button className="comp-btn-sm" onClick={() => handleRecibir(c.id)}
                      style={{ background: "rgba(34,197,94,.2)", color: "#22c55e" }}>
                      Recibir
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {compras.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 30 }}>No hay compras registradas</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Nueva Compra</h3>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Proveedor</label>
                <select className="form-input" value={form.proveedor}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {proveedores.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">NCF Proveedor</label>
                <input className="form-input" value={form.ncf_proveedor}
                  onChange={(e) => setForm({ ...form, ncf_proveedor: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input type="date" className="form-input" value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo Bienes/Servicios</label>
                <select className="form-input" value={form.tipo_bienes_servicios}
                  onChange={(e) => setForm({ ...form, tipo_bienes_servicios: e.target.value })}>
                  <option value="02">02 - Gastos por Trabajos/Suministros</option>
                  <option value="09">09 - Costo de Venta</option>
                  <option value="10">10 - Adquisición de Activos</option>
                  <option value="13">13 - Compra de bienes</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Forma de Pago</label>
                <select className="form-input" value={form.forma_pago}
                  onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="CREDITO">Crédito</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">ITBIS Retenido</label>
                <input type="number" className="form-input" value={form.itbis_retenido}
                  onChange={(e) => setForm({ ...form, itbis_retenido: +e.target.value })} />
              </div>
            </div>

            <div style={{ margin: "16px 0 8px", fontWeight: 600 }}>Detalles</div>
            {detalles.map((d: any, i: number) => (
              <div className="det-row" key={i}>
                <select className="form-input" value={d.producto}
                  onChange={(e) => {
                    const nd = [...detalles]; nd[i].producto = e.target.value; setDetalles(nd);
                  }}>
                  <option value="">Producto...</option>
                  {productos.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                <input type="number" className="form-input" placeholder="Cant" value={d.cantidad}
                  onChange={(e) => {
                    const nd = [...detalles]; nd[i].cantidad = +e.target.value; setDetalles(nd);
                  }} />
                <input type="number" className="form-input" placeholder="Precio" value={d.precio}
                  onChange={(e) => {
                    const nd = [...detalles]; nd[i].precio = +e.target.value; setDetalles(nd);
                  }} />
                <button className="comp-btn-sm" style={{ background: "rgba(239,68,68,.2)", color: "#ef4444" }}
                  onClick={() => setDetalles(detalles.filter((_: any, j: number) => j !== i))}>X</button>
              </div>
            ))}
            <button className="comp-btn-sm" onClick={addDetalle}
              style={{ background: `${tema.accent}20`, color: tema.accent, marginBottom: 16 }}>
              + Agregar Producto
            </button>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="comp-btn-sm" onClick={() => setShowModal(false)}
                style={{ background: tema.borde, color: tema.texto }}>Cancelar</button>
              <button className="comp-btn" onClick={handleCreate}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
