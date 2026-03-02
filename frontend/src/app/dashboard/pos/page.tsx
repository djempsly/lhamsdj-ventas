"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { posService } from "@/services/fiscal";
import { clienteService } from "@/services/clientes";

interface Producto {
  id: string;
  codigo_barras: string;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  stock_actual: number;
  aplica_impuesto: boolean;
  tasa_impuesto: number;
}

interface CartItem {
  producto: Producto;
  cantidad: number;
  descuento: number;
}

interface Cliente {
  id: string;
  nombre: string;
  numero_documento: string;
  tipo_cliente: string;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function POSPage() {
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [tipoPago, setTipoPago] = useState("EFECTIVO");
  const [montoPagado, setMontoPagado] = useState("");
  const [descuentoGlobal, setDescuentoGlobal] = useState("");
  const [notas, setNotas] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [ventaCreada, setVentaCreada] = useState<{numero: string; total: number; cambio: number} | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    clienteService.getAll().then(({ data }) => {
      const list = Array.isArray(data) ? data : data.results || [];
      setClientes(list.filter((c: Cliente) => c.tipo_cliente !== undefined));
    }).catch(() => {});
    inputRef.current?.focus();
  }, []);

  const buscar = useCallback((q: string) => {
    if (q.trim().length < 1) { setResultados([]); return; }
    setBuscando(true);
    posService.buscarProducto(q).then(({ data }) => {
      setResultados(Array.isArray(data) ? data : []);
    }).catch(() => setResultados([])).finally(() => setBuscando(false));
  }, []);

  const onBusquedaChange = (val: string) => {
    setBusqueda(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscar(val), 300);
  };

  const agregarAlCarrito = (p: Producto) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.producto.id === p.id);
      if (idx >= 0) {
        const updated = [...prev];
        if (updated[idx].cantidad < p.stock_actual) {
          updated[idx] = { ...updated[idx], cantidad: updated[idx].cantidad + 1 };
        }
        return updated;
      }
      return [...prev, { producto: p, cantidad: 1, descuento: 0 }];
    });
    setBusqueda("");
    setResultados([]);
    inputRef.current?.focus();
  };

  const actualizarCantidad = (idx: number, cant: number) => {
    if (cant < 1) return;
    setCart(prev => {
      const updated = [...prev];
      if (cant <= updated[idx].producto.stock_actual) {
        updated[idx] = { ...updated[idx], cantidad: cant };
      }
      return updated;
    });
  };

  const quitarDelCarrito = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const subtotal = cart.reduce((sum, c) => sum + c.cantidad * c.producto.precio_venta - c.descuento, 0);
  const descGlobal = parseFloat(descuentoGlobal) || 0;
  const subtotalConDesc = subtotal - descGlobal;
  const impuestos = cart.reduce((sum, c) => {
    if (c.producto.aplica_impuesto) {
      const lineaSub = c.cantidad * c.producto.precio_venta - c.descuento;
      return sum + lineaSub * (c.producto.tasa_impuesto / 100);
    }
    return sum;
  }, 0);
  const total = subtotalConDesc + impuestos;
  const pagado = parseFloat(montoPagado) || 0;
  const cambio = tipoPago === "EFECTIVO" ? Math.max(0, pagado - total) : 0;

  const formatCurrency = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);

  const cobrar = async () => {
    setError("");
    if (cart.length === 0) { setError("El carrito esta vacio."); return; }
    if (tipoPago === "EFECTIVO" && pagado < total) { setError("Monto pagado insuficiente."); return; }

    setProcesando(true);
    try {
      const ventaData = {
        cliente: clienteId || null,
        tipo_pago: tipoPago,
        subtotal: subtotal,
        descuento: descGlobal,
        subtotal_con_descuento: subtotalConDesc,
        total_impuestos: impuestos,
        total: total,
        monto_pagado: tipoPago === "EFECTIVO" ? pagado : total,
        cambio: cambio,
        estado: "COMPLETADA",
        notas: notas,
        detalles_input: cart.map(c => ({
          producto: c.producto.id,
          cantidad: c.cantidad,
          precio_unitario: c.producto.precio_venta,
          descuento: c.descuento,
        })),
      };
      const { data } = await posService.crearVenta(ventaData);
      setVentaCreada({ numero: data.numero, total: data.total, cambio });
      setExito(true);
      setCart([]);
      setMontoPagado("");
      setDescuentoGlobal("");
      setNotas("");
      setClienteId("");
    } catch {
      setError("Error al procesar la venta. Intente nuevamente.");
    } finally {
      setProcesando(false);
    }
  };

  const esClaro = tema.texto === "#0f172a";
  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:${tema.bg}; font-family:'DM Sans',sans-serif; }
        .pos-root { min-height:100vh; background:${tema.bg}; color:${tema.texto}; display:flex; flex-direction:column; }
        .pos-header {
          display:flex; align-items:center; justify-content:space-between;
          padding:16px 24px; border-bottom:1px solid ${tema.borde};
          background:${esClaro ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.02)"};
          backdrop-filter:blur(12px);
        }
        .pos-header-left { display:flex; align-items:center; gap:12px; }
        .back-btn {
          background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:10px; padding:8px 16px; color:${tema.subtexto};
          font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif;
        }
        .back-btn:hover { color:${tema.accent}; border-color:${tema.accent}40; }
        .pos-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; }
        .pos-title span { color:${tema.accent}; }
        .pos-body { display:flex; flex:1; min-height:0; }
        .pos-left { flex:7; padding:20px; display:flex; flex-direction:column; gap:16px; border-right:1px solid ${tema.borde}; overflow-y:auto; }
        .pos-right { flex:3; min-width:340px; padding:20px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; }
        .search-input {
          width:100%; background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:10px; padding:12px 16px; color:${tema.texto}; font-size:15px;
          font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s;
        }
        .search-input::placeholder { color:${tema.subtexto}; }
        .search-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .results-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; }
        .product-card {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px;
          padding:14px; cursor:pointer; transition:all 0.2s;
        }
        .product-card:hover { border-color:${tema.accent}40; transform:translateY(-2px); box-shadow:0 4px 16px ${tema.accent}15; }
        .product-card .pc-name { font-weight:600; font-size:14px; margin-bottom:4px; }
        .product-card .pc-code { font-size:11px; color:${tema.subtexto}; font-family:monospace; }
        .product-card .pc-price { color:${tema.accent}; font-weight:700; font-family:'Syne',sans-serif; font-size:16px; margin-top:8px; }
        .product-card .pc-stock { font-size:11px; color:${tema.subtexto}; }
        .section-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.1em; font-weight:600; }
        .cart-empty { text-align:center; padding:40px 10px; color:${tema.subtexto}; font-size:14px; }
        .cart-item {
          display:flex; align-items:center; gap:10px;
          padding:10px 0; border-bottom:1px solid ${tema.borde};
        }
        .cart-item-info { flex:1; }
        .cart-item-name { font-size:13px; font-weight:500; }
        .cart-item-price { font-size:12px; color:${tema.subtexto}; }
        .cart-qty { display:flex; align-items:center; gap:6px; }
        .qty-btn {
          width:28px; height:28px; border-radius:8px; border:1px solid ${tema.borde};
          background:${tema.card}; color:${tema.texto}; font-size:16px;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
          transition:all 0.2s; font-family:'DM Sans',sans-serif;
        }
        .qty-btn:hover { border-color:${tema.accent}40; color:${tema.accent}; }
        .qty-val { font-weight:700; font-size:14px; min-width:24px; text-align:center; }
        .cart-remove {
          background:none; border:none; color:rgba(239,68,68,0.6); cursor:pointer;
          font-size:18px; padding:4px; transition:all 0.2s;
        }
        .cart-remove:hover { color:#ef4444; }
        .cart-total-section { border-top:2px solid ${tema.borde}; padding-top:12px; margin-top:auto; }
        .cart-line { display:flex; justify-content:space-between; font-size:13px; color:${tema.subtexto}; margin-bottom:6px; }
        .cart-total { display:flex; justify-content:space-between; font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:${tema.accent}; margin:12px 0; }
        .pay-section { display:flex; flex-direction:column; gap:10px; }
        .pay-input {
          background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"};
          border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px;
          font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif;
          outline:none; width:100%; transition:all 0.2s;
        }
        .pay-input:focus { border-color:${tema.accent}50; }
        .pay-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; }
        .pay-types { display:flex; gap:6px; flex-wrap:wrap; }
        .pay-type {
          padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600;
          cursor:pointer; border:1px solid ${tema.borde}; background:${tema.card};
          color:${tema.subtexto}; transition:all 0.2s; font-family:'DM Sans',sans-serif;
        }
        .pay-type.active { background:${tema.accent}; color:white; border-color:${tema.accent}; }
        .btn-cobrar {
          background:linear-gradient(135deg, #059669, #10b981); border:none; border-radius:12px;
          padding:14px; color:white; font-size:16px; font-weight:700; cursor:pointer;
          font-family:'Syne',sans-serif; transition:all 0.2s; box-shadow:0 4px 16px rgba(16,185,129,0.3);
        }
        .btn-cobrar:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(16,185,129,0.4); }
        .btn-cobrar:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
        .error-msg {
          background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18);
          border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5;
        }
        .modal-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.7);
          display:flex; align-items:center; justify-content:center;
          z-index:1000; backdrop-filter:blur(4px);
        }
        .modal {
          background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde};
          border-radius:20px; padding:36px; width:100%; max-width:400px; text-align:center;
          box-shadow:0 30px 60px rgba(0,0,0,0.4);
        }
        .modal-success-icon { font-size:48px; color:#10b981; margin-bottom:16px; }
        .modal h2 { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:8px; }
        .modal p { font-size:14px; color:${tema.subtexto}; margin-bottom:4px; }
        .modal .total-display { font-family:'Syne',sans-serif; font-size:28px; color:${tema.accent}; font-weight:800; margin:16px 0; }
        .btn-new-sale {
          background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none;
          border-radius:10px; padding:12px 24px; color:white; font-size:14px; font-weight:600;
          cursor:pointer; font-family:'Syne',sans-serif; margin-top:16px;
        }
        .search-hint { font-size:13px; color:${tema.subtexto}; padding:20px; text-align:center; }
      `}</style>

      <div className="pos-root">
        <div className="pos-header">
          <div className="pos-header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="pos-title"><span>Punto</span> de Venta</h1>
          </div>
        </div>

        <div className="pos-body">
          <div className="pos-left">
            <input
              ref={inputRef}
              className="search-input"
              placeholder="Buscar producto por nombre o codigo de barras..."
              value={busqueda}
              onChange={e => onBusquedaChange(e.target.value.substring(0, 100))}
              maxLength={100}
            />
            {buscando && <div className="search-hint">Buscando...</div>}
            {!buscando && busqueda && resultados.length === 0 && (
              <div className="search-hint">No se encontraron productos para &quot;{busqueda}&quot;</div>
            )}
            {resultados.length > 0 && (
              <>
                <div className="section-label">Resultados ({resultados.length})</div>
                <div className="results-grid">
                  {resultados.map(p => (
                    <div key={p.id} className="product-card" onClick={() => agregarAlCarrito(p)}>
                      <div className="pc-name">{p.nombre}</div>
                      <div className="pc-code">{p.codigo_barras}</div>
                      <div className="pc-price">{formatCurrency(p.precio_venta)}</div>
                      <div className="pc-stock">Stock: {p.stock_actual}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!busqueda && resultados.length === 0 && !buscando && (
              <div className="search-hint">Escribe el nombre o codigo del producto para buscarlo</div>
            )}
          </div>

          <div className="pos-right">
            <div className="section-label">Carrito ({cart.length} items)</div>

            {cart.length === 0 ? (
              <div className="cart-empty">Agrega productos buscando a la izquierda</div>
            ) : (
              <>
                {cart.map((c, i) => (
                  <div key={c.producto.id} className="cart-item">
                    <div className="cart-item-info">
                      <div className="cart-item-name">{c.producto.nombre}</div>
                      <div className="cart-item-price">{formatCurrency(c.producto.precio_venta)} x {c.cantidad}</div>
                    </div>
                    <div className="cart-qty">
                      <button className="qty-btn" onClick={() => actualizarCantidad(i, c.cantidad - 1)}>-</button>
                      <span className="qty-val">{c.cantidad}</span>
                      <button className="qty-btn" onClick={() => actualizarCantidad(i, c.cantidad + 1)}>+</button>
                    </div>
                    <button className="cart-remove" onClick={() => quitarDelCarrito(i)}>x</button>
                  </div>
                ))}
              </>
            )}

            <div className="cart-total-section">
              <div className="cart-line"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {descGlobal > 0 && <div className="cart-line"><span>Descuento</span><span>-{formatCurrency(descGlobal)}</span></div>}
              <div className="cart-line"><span>Impuestos</span><span>{formatCurrency(impuestos)}</span></div>
              <div className="cart-total"><span>Total</span><span>{formatCurrency(total)}</span></div>
              {tipoPago === "EFECTIVO" && pagado > 0 && (
                <div className="cart-line" style={{color:"#10b981",fontWeight:600}}>
                  <span>Cambio</span><span>{formatCurrency(cambio)}</span>
                </div>
              )}
            </div>

            <div className="pay-section">
              <div>
                <div className="pay-label">Cliente (opcional)</div>
                <select className="pay-input" value={clienteId} onChange={e => setClienteId(e.target.value)}>
                  <option value="">Consumidor final</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} - {c.numero_documento}</option>)}
                </select>
              </div>
              <div>
                <div className="pay-label">Tipo de pago</div>
                <div className="pay-types">
                  {["EFECTIVO","TARJETA","TRANSFERENCIA","MIXTO"].map(t => (
                    <button key={t} className={`pay-type ${tipoPago===t?"active":""}`}
                      onClick={() => setTipoPago(t)}>{t}</button>
                  ))}
                </div>
              </div>
              {tipoPago === "EFECTIVO" && (
                <div>
                  <div className="pay-label">Monto pagado</div>
                  <input className="pay-input" type="number" step="0.01" min="0"
                    placeholder="0.00" value={montoPagado}
                    onChange={e => setMontoPagado(e.target.value)} />
                </div>
              )}
              <div>
                <div className="pay-label">Descuento global</div>
                <input className="pay-input" type="number" step="0.01" min="0"
                  placeholder="0.00" value={descuentoGlobal}
                  onChange={e => setDescuentoGlobal(e.target.value)} />
              </div>
              <div>
                <div className="pay-label">Notas</div>
                <input className="pay-input" placeholder="Notas de la venta..." value={notas}
                  onChange={e => setNotas(e.target.value.substring(0, 500))} maxLength={500} />
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button className="btn-cobrar" onClick={cobrar} disabled={procesando || cart.length === 0}>
                {procesando ? "Procesando..." : `Cobrar ${formatCurrency(total)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {exito && ventaCreada && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setExito(false); setVentaCreada(null); } }}>
          <div className="modal">
            <div className="modal-success-icon">OK</div>
            <h2>Venta Completada</h2>
            <p>No. {ventaCreada.numero}</p>
            <div className="total-display">{formatCurrency(ventaCreada.total)}</div>
            {ventaCreada.cambio > 0 && <p>Cambio: {formatCurrency(ventaCreada.cambio)}</p>}
            <button className="btn-new-sale" onClick={() => { setExito(false); setVentaCreada(null); inputRef.current?.focus(); }}>
              Nueva Venta
            </button>
          </div>
        </div>
      )}
    </>
  );
}
