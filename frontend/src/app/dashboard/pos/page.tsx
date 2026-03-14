"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { posService } from "@/services/fiscal";
import { ventaService } from "@/services/ventas";
import { clienteService } from "@/services/clientes";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency, DENOMINACIONES_RD, TIPOS_NCF } from "@/lib/constants";

interface Producto {
  id: string;
  codigo_barras: string;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  stock_actual: number;
  aplica_impuesto: boolean;
  tasa_impuesto: number;
  categoria?: string;
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

interface VentaHistorial {
  id: string;
  numero: string;
  total: number;
  estado: string;
  creado_en: string;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

const CATEGORIAS = ["Todos", "Bebidas", "Alimentos", "Limpieza", "Ferreteria", "Otros"];

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
  const [tipoNCF, setTipoNCF] = useState("B02");
  const [montoPagado, setMontoPagado] = useState("");
  const [descuentoGlobal, setDescuentoGlobal] = useState("");
  const [notas, setNotas] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [exito, setExito] = useState(false);
  const [ventaCreada, setVentaCreada] = useState<{ numero: string; total: number; cambio: number } | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState("Todos");
  const [online, setOnline] = useState(true);
  const [showCuadre, setShowCuadre] = useState(false);
  const [denominaciones, setDenominaciones] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINACIONES_RD.map(d => [d, 0]))
  );
  const [showDescAuth, setShowDescAuth] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [historial, setHistorial] = useState<VentaHistorial[]>([]);

  const barcodeBuffer = useRef("");
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cobrarRef = useRef<(() => void) | null>(null);

  const { maxDiscount, canVoidSales, canAccessPOS } = usePermissions();

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }

    // Load clients
    clienteService.getAll().then(({ data }) => {
      const list = Array.isArray(data) ? data : data.results || [];
      setClientes(list);
    }).catch(() => {});

    // Load recent sales
    ventaService.getAll({ page_size: "5", ordering: "-creado_en" }).then(({ data }) => {
      setHistorial(data.results || []);
    }).catch(() => {});

    inputRef.current?.focus();

    // Online/offline
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Barcode scanner
    const handleBarcode = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Enter" && barcodeBuffer.current.length >= 4) {
        const code = barcodeBuffer.current;
        barcodeBuffer.current = "";
        posService.buscarProducto(code).then(({ data }) => {
          const prods = Array.isArray(data) ? data : [];
          if (prods.length === 1) agregarAlCarrito(prods[0]);
          else if (prods.length > 1) { setResultados(prods); setBusqueda(code); }
        }).catch(() => {});
        return;
      }
      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ""; }, 100);
      }
    };

    const handleShortcuts = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); inputRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); cobrarRef.current?.(); }
      if (e.key === "F8") { e.preventDefault(); setFullscreen(f => !f); }
      if (e.key === "Escape") { setResultados([]); setBusqueda(""); }
    };

    window.addEventListener("keydown", handleBarcode);
    window.addEventListener("keydown", handleShortcuts);
    return () => {
      window.removeEventListener("keydown", handleBarcode);
      window.removeEventListener("keydown", handleShortcuts);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscar = useCallback((q: string, cat?: string) => {
    if (q.trim().length < 1 && cat === "Todos") { setResultados([]); return; }
    setBuscando(true);
    let query = q.trim();
    if (cat && cat !== "Todos") query = query ? `${query}&categoria=${cat}` : `?categoria=${cat}`;
    posService.buscarProducto(query || "*").then(({ data }) => {
      let prods = Array.isArray(data) ? data : [];
      if (cat && cat !== "Todos") {
        prods = prods.filter((p: Producto) => (p.categoria || "").toLowerCase().includes(cat.toLowerCase()));
      }
      setResultados(prods);
    }).catch(() => setResultados([])).finally(() => setBuscando(false));
  }, []);

  const onBusquedaChange = (val: string) => {
    setBusqueda(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscar(val, categoriaActiva), 300);
  };

  const onCategoriaChange = (cat: string) => {
    setCategoriaActiva(cat);
    if (cat !== "Todos") buscar(busqueda, cat);
    else if (busqueda) buscar(busqueda, "Todos");
    else setResultados([]);
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

  const quitarDelCarrito = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

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

  const totalCuadre = DENOMINACIONES_RD.reduce((sum, d) => sum + d * (denominaciones[d] || 0), 0);

  const ncfRequiresClient = tipoNCF !== "B02";

  const cobrar = async () => {
    setError("");
    if (cart.length === 0) { setError("El carrito esta vacio."); return; }
    if (tipoPago === "EFECTIVO" && pagado < total) { setError("Monto pagado insuficiente."); return; }
    if (ncfRequiresClient && !clienteId) { setError(`NCF tipo ${tipoNCF} requiere un cliente.`); return; }

    // Discount authorization check
    if (descGlobal > 0 && subtotal > 0) {
      const pct = (descGlobal / subtotal) * 100;
      if (pct > maxDiscount) {
        setShowDescAuth(true);
        return;
      }
    }

    setProcesando(true);
    try {
      const ventaData = {
        cliente: clienteId || null,
        tipo_pago: tipoPago,
        tipo_ncf: tipoNCF,
        subtotal, descuento: descGlobal,
        subtotal_con_descuento: subtotalConDesc,
        total_impuestos: impuestos,
        total, monto_pagado: tipoPago === "EFECTIVO" ? pagado : total,
        cambio, estado: "COMPLETADA", notas,
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
      setCart([]); setMontoPagado(""); setDescuentoGlobal(""); setNotas(""); setClienteId(""); setTipoNCF("B02");
      // Refresh historial
      ventaService.getAll({ page_size: "5", ordering: "-creado_en" }).then(({ data: d }) => {
        setHistorial(d.results || []);
      }).catch(() => {});
    } catch {
      setError("Error al procesar la venta. Intente nuevamente.");
    } finally {
      setProcesando(false);
    }
  };

  cobrarRef.current = cobrar;

  const anularVenta = async (id: string) => {
    const motivo = prompt("Motivo de anulacion:");
    if (!motivo) return;
    try {
      await ventaService.anular(id);
      setHistorial(prev => prev.map(v => v.id === id ? { ...v, estado: "ANULADA" } : v));
    } catch { /* error */ }
  };

  const imprimirRecibo = (venta: { numero: string; total: number; cambio: number }) => {
    const win = window.open("", "_blank", "width=320,height=600");
    if (!win) return;
    const fecha = new Date().toLocaleString("es-DO");
    win.document.write(`<!DOCTYPE html><html><head><title>Recibo ${venta.numero}</title>
      <style>body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:10px;font-size:12px}.center{text-align:center}.line{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between}.bold{font-weight:bold}.big{font-size:16px;font-weight:bold}h2{margin:4px 0;font-size:14px}@media print{body{width:auto}}</style></head><body>
      <div class="center"><h2>L'hams DJ - ERP</h2><p>${fecha}</p></div>
      <div class="line"></div>
      <div class="row bold"><span>Recibo #${venta.numero}</span><span>NCF: ${tipoNCF}</span></div>
      <div class="line"></div>
      ${cart.map(c => `<div class="row"><span>${c.producto.nombre} x${c.cantidad}</span><span>$${(c.cantidad * c.producto.precio_venta).toFixed(2)}</span></div>`).join("")}
      <div class="line"></div>
      <div class="row big"><span>TOTAL:</span><span>$${venta.total.toFixed(2)}</span></div>
      ${tipoPago === "EFECTIVO" ? `<div class="row bold"><span>Cambio:</span><span>$${venta.cambio.toFixed(2)}</span></div>` : `<div class="row"><span>Pago:</span><span>${tipoPago}</span></div>`}
      <div class="line"></div>
      <div class="center"><p>Gracias por su compra!</p></div>
      </body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
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
          padding:12px 20px; border-bottom:1px solid ${tema.borde};
          background:${esClaro ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.02)"};
          backdrop-filter:blur(12px); flex-wrap:wrap; gap:8px;
        }
        .pos-header-left { display:flex; align-items:center; gap:10px; }
        .back-btn { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:8px; padding:6px 14px; color:${tema.subtexto}; font-size:12px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .back-btn:hover { color:${tema.accent}; border-color:${tema.accent}40; }
        .pos-title { font-family:'Syne',sans-serif; font-size:18px; font-weight:800; }
        .pos-title span { color:${tema.accent}; }
        .online-indicator { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; padding:4px 10px; border-radius:100px; }
        .online-dot { width:8px; height:8px; border-radius:50%; }
        .pos-body { display:flex; flex:1; min-height:0; }
        .pos-left { flex:7; padding:16px; display:flex; flex-direction:column; gap:12px; border-right:1px solid ${tema.borde}; overflow-y:auto; }
        .pos-right { flex:3; min-width:340px; padding:16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto; }
        .search-input { width:100%; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; color:${tema.texto}; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .search-input::placeholder { color:${tema.subtexto}; }
        .search-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .categories { display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; }
        .cat-btn { padding:6px 14px; border-radius:100px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid ${tema.borde}; background:${tema.card}; color:${tema.subtexto}; transition:all 0.15s; font-family:'DM Sans',sans-serif; white-space:nowrap; min-height:32px; }
        .cat-btn.active { background:${tema.accent}; color:white; border-color:${tema.accent}; }
        .cat-btn:hover:not(.active) { border-color:${tema.accent}40; color:${tema.accent}; }
        .results-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; }
        .product-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:12px; cursor:pointer; transition:all 0.2s; }
        .product-card:hover { border-color:${tema.accent}40; transform:translateY(-1px); }
        .pc-name { font-weight:600; font-size:13px; margin-bottom:2px; }
        .pc-code { font-size:10px; color:${tema.subtexto}; font-family:monospace; }
        .pc-price { color:${tema.accent}; font-weight:700; font-family:'Syne',sans-serif; font-size:15px; margin-top:6px; }
        .pc-stock { font-size:10px; color:${tema.subtexto}; }
        .section-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.1em; font-weight:600; }
        .cart-empty { text-align:center; padding:30px 10px; color:${tema.subtexto}; font-size:13px; }
        .cart-item { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid ${tema.borde}; }
        .cart-item-info { flex:1; }
        .cart-item-name { font-size:12px; font-weight:500; }
        .cart-item-price { font-size:11px; color:${tema.subtexto}; }
        .cart-qty { display:flex; align-items:center; gap:4px; }
        .qty-btn { width:26px; height:26px; border-radius:6px; border:1px solid ${tema.borde}; background:${tema.card}; color:${tema.texto}; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; min-height:26px; }
        .qty-btn:hover { border-color:${tema.accent}40; color:${tema.accent}; }
        .qty-val { font-weight:700; font-size:13px; min-width:20px; text-align:center; }
        .cart-remove { background:none; border:none; color:rgba(239,68,68,0.6); cursor:pointer; font-size:16px; padding:2px; }
        .cart-remove:hover { color:#ef4444; }
        .cart-total-section { border-top:2px solid ${tema.borde}; padding-top:10px; margin-top:auto; }
        .cart-line { display:flex; justify-content:space-between; font-size:12px; color:${tema.subtexto}; margin-bottom:4px; }
        .cart-total { display:flex; justify-content:space-between; font-family:'Syne',sans-serif; font-size:20px; font-weight:800; color:${tema.accent}; margin:10px 0; }
        .ncf-row { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px; }
        .ncf-btn { padding:5px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; border:1px solid ${tema.borde}; background:${tema.card}; color:${tema.subtexto}; transition:all 0.15s; font-family:'Syne',sans-serif; min-height:28px; }
        .ncf-btn.active { background:${tema.accent}; color:white; border-color:${tema.accent}; }
        .pay-section { display:flex; flex-direction:column; gap:8px; }
        .pay-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:8px; padding:8px 12px; font-size:13px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; width:100%; }
        .pay-input:focus { border-color:${tema.accent}50; }
        .pay-input.required-error { border-color:rgba(239,68,68,0.5); }
        .pay-label { font-size:10px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; }
        .pay-types { display:flex; gap:4px; flex-wrap:wrap; }
        .pay-type { padding:5px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; border:1px solid ${tema.borde}; background:${tema.card}; color:${tema.subtexto}; transition:all 0.15s; font-family:'DM Sans',sans-serif; min-height:28px; }
        .pay-type.active { background:${tema.accent}; color:white; border-color:${tema.accent}; }
        .btn-cobrar { background:linear-gradient(135deg, #059669, #10b981); border:none; border-radius:10px; padding:12px; color:white; font-size:15px; font-weight:700; cursor:pointer; font-family:'Syne',sans-serif; transition:all 0.2s; box-shadow:0 4px 16px rgba(16,185,129,0.3); min-height:44px; }
        .btn-cobrar:hover { transform:translateY(-1px); }
        .btn-cobrar:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
        .error-msg { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:8px; padding:8px 12px; font-size:12px; color:#fca5a5; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:16px; padding:28px; width:100%; max-width:420px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); text-align:center; }
        .modal h2 { font-family:'Syne',sans-serif; font-size:18px; font-weight:800; margin-bottom:8px; }
        .modal p { font-size:13px; color:${tema.subtexto}; margin-bottom:4px; }
        .modal .total-display { font-family:'Syne',sans-serif; font-size:26px; color:${tema.accent}; font-weight:800; margin:12px 0; }
        .btn-action { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:8px; padding:10px 20px; color:white; font-size:13px; font-weight:600; cursor:pointer; font-family:'Syne',sans-serif; margin:4px; min-height:40px; }
        .search-hint { font-size:12px; color:${tema.subtexto}; padding:16px; text-align:center; }
        .pos-fullscreen { position:fixed; inset:0; z-index:9999; }
        .historial-section { border-top:1px solid ${tema.borde}; padding-top:10px; margin-top:8px; }
        .historial-item { display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid ${tema.borde}; font-size:11px; }
        .historial-num { font-family:monospace; color:${tema.accent}; font-weight:600; }
        .badge { display:inline-flex; padding:2px 6px; border-radius:100px; font-size:9px; font-weight:700; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .void-btn { background:none; border:1px solid rgba(239,68,68,0.3); border-radius:4px; padding:2px 6px; font-size:10px; color:#ef4444; cursor:pointer; font-family:'DM Sans',sans-serif; min-height:22px; }
        .void-btn:hover { background:rgba(239,68,68,0.1); }
        /* Cuadre modal */
        .cuadre-grid { display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center; text-align:left; }
        .cuadre-denom { font-family:'Syne',sans-serif; font-weight:700; font-size:14px; }
        .cuadre-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:6px; padding:6px 10px; font-size:13px; color:${tema.texto}; width:80px; text-align:center; outline:none; font-family:'DM Sans',sans-serif; }
        .cuadre-subtotal { font-size:13px; color:${tema.subtexto}; text-align:right; min-width:80px; }
        .cuadre-total { display:flex; justify-content:space-between; font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-top:16px; padding-top:12px; border-top:2px solid ${tema.borde}; }
        @media (max-width: 768px) {
          .pos-body { flex-direction:column; }
          .pos-left { border-right:none; border-bottom:1px solid ${tema.borde}; max-height:50vh; }
          .pos-right { min-width:auto; }
          .results-grid { grid-template-columns:repeat(2, 1fr); }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .pos-right { min-width:300px; flex:4; }
          .pos-left { flex:6; }
        }
      `}</style>

      <div className={`pos-root ${fullscreen ? "pos-fullscreen" : ""}`}>
        <div className="pos-header">
          <div className="pos-header-left">
            {!fullscreen && <button className="back-btn" onClick={() => window.location.href = "/dashboard"}>Volver</button>}
            <h1 className="pos-title"><span>Punto</span> de Venta</h1>
            <div className="online-indicator" style={{
              background: online ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              color: online ? "#10b981" : "#ef4444",
            }}>
              <div className="online-dot" style={{ background: online ? "#10b981" : "#ef4444" }} />
              {online ? "En linea" : "Sin conexion"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: tema.subtexto }}>F2 Buscar | F4 Cobrar | F8 Pantalla</span>
            <button className="back-btn" onClick={() => setShowCuadre(true)}>Cuadre</button>
            <button className="back-btn" onClick={() => setFullscreen(f => !f)}>
              {fullscreen ? "Salir" : "Pantalla completa"}
            </button>
          </div>
        </div>

        <div className="pos-body">
          <div className="pos-left">
            <input ref={inputRef} className="search-input" placeholder="Buscar producto por nombre o codigo..." value={busqueda} onChange={e => onBusquedaChange(e.target.value.substring(0, 100))} maxLength={100} />

            <div className="categories">
              {CATEGORIAS.map(cat => (
                <button key={cat} className={`cat-btn ${categoriaActiva === cat ? "active" : ""}`} onClick={() => onCategoriaChange(cat)}>
                  {cat}
                </button>
              ))}
            </div>

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
              <div className="cart-line"><span>ITBIS</span><span>{formatCurrency(impuestos)}</span></div>
              <div className="cart-total"><span>Total</span><span>{formatCurrency(total)}</span></div>
              {tipoPago === "EFECTIVO" && pagado > 0 && (
                <div className="cart-line" style={{ color: "#10b981", fontWeight: 600 }}>
                  <span>Cambio</span><span>{formatCurrency(cambio)}</span>
                </div>
              )}
            </div>

            <div className="pay-section">
              {/* NCF Type */}
              <div>
                <div className="pay-label">Tipo NCF</div>
                <div className="ncf-row">
                  {TIPOS_NCF.filter(t => t.codigo !== "B11").map(t => (
                    <button key={t.codigo} className={`ncf-btn ${tipoNCF === t.codigo ? "active" : ""}`} onClick={() => setTipoNCF(t.codigo)}>
                      {t.codigo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Client */}
              <div>
                <div className="pay-label">Cliente {ncfRequiresClient && <span style={{ color: "#ef4444" }}>*</span>}</div>
                <select className={`pay-input ${ncfRequiresClient && !clienteId ? "required-error" : ""}`} value={clienteId} onChange={e => setClienteId(e.target.value)}>
                  <option value="">Consumidor final</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} - {c.numero_documento}</option>)}
                </select>
              </div>

              {/* Payment type */}
              <div>
                <div className="pay-label">Tipo de pago</div>
                <div className="pay-types">
                  {["EFECTIVO", "TARJETA", "TRANSFERENCIA", "MIXTO"].map(t => (
                    <button key={t} className={`pay-type ${tipoPago === t ? "active" : ""}`} onClick={() => setTipoPago(t)}>{t}</button>
                  ))}
                </div>
              </div>

              {tipoPago === "EFECTIVO" && (
                <div>
                  <div className="pay-label">Monto pagado</div>
                  <input className="pay-input" type="number" step="0.01" min="0" placeholder="0.00" value={montoPagado} onChange={e => setMontoPagado(e.target.value)} />
                </div>
              )}

              <div>
                <div className="pay-label">Descuento global</div>
                <input className="pay-input" type="number" step="0.01" min="0" placeholder="0.00" value={descuentoGlobal} onChange={e => setDescuentoGlobal(e.target.value)} />
              </div>

              <div>
                <div className="pay-label">Notas</div>
                <input className="pay-input" placeholder="Notas..." value={notas} onChange={e => setNotas(e.target.value.substring(0, 500))} maxLength={500} />
              </div>

              {error && <div className="error-msg">{error}</div>}

              <button className="btn-cobrar" onClick={cobrar} disabled={procesando || cart.length === 0}>
                {procesando ? "Procesando..." : `Cobrar ${formatCurrency(total)}`}
              </button>
            </div>

            {/* Sale History */}
            {historial.length > 0 && (
              <div className="historial-section">
                <div className="section-label">Ultimas ventas</div>
                {historial.map(v => (
                  <div key={v.id} className="historial-item">
                    <span className="historial-num">{v.numero}</span>
                    <span>{formatCurrency(v.total)}</span>
                    <span className={`badge ${v.estado === "COMPLETADA" ? "badge-green" : "badge-red"}`}>{v.estado}</span>
                    {canVoidSales && v.estado === "COMPLETADA" && (
                      <button className="void-btn" onClick={() => anularVenta(v.id)}>Anular</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {exito && ventaCreada && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setExito(false); setVentaCreada(null); } }}>
          <div className="modal">
            <div style={{ fontSize: 40, color: "#10b981", marginBottom: 12 }}>OK</div>
            <h2>Venta Completada</h2>
            <p>No. {ventaCreada.numero}</p>
            <div className="total-display">{formatCurrency(ventaCreada.total)}</div>
            {ventaCreada.cambio > 0 && <p>Cambio: {formatCurrency(ventaCreada.cambio)}</p>}
            <div style={{ marginTop: 12 }}>
              <button className="btn-action" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }} onClick={() => imprimirRecibo(ventaCreada)}>Imprimir</button>
              <button className="btn-action" onClick={() => { setExito(false); setVentaCreada(null); inputRef.current?.focus(); }}>Nueva Venta</button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Drawer Modal */}
      {showCuadre && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCuadre(false); }}>
          <div className="modal" style={{ textAlign: "left", maxWidth: 480 }}>
            <h2 style={{ marginBottom: 20 }}>Cuadre de Caja</h2>
            <div className="cuadre-grid">
              {DENOMINACIONES_RD.map(d => (
                <React.Fragment key={d}>
                  <div className="cuadre-denom">RD$ {d.toLocaleString()}</div>
                  <input
                    className="cuadre-input"
                    type="number" min="0"
                    value={denominaciones[d] || ""}
                    onChange={e => setDenominaciones({ ...denominaciones, [d]: parseInt(e.target.value) || 0 })}
                  />
                  <div className="cuadre-subtotal">{formatCurrency(d * (denominaciones[d] || 0))}</div>
                </React.Fragment>
              ))}
            </div>
            <div className="cuadre-total">
              <span>Total</span>
              <span style={{ color: tema.accent }}>{formatCurrency(totalCuadre)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="back-btn" onClick={() => setShowCuadre(false)}>Cerrar</button>
              <button className="btn-action" onClick={() => { setShowCuadre(false); }}>Guardar Cuadre</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Authorization Modal */}
      {showDescAuth && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowDescAuth(false); }}>
          <div className="modal">
            <h2>Autorizacion Requerida</h2>
            <p style={{ marginBottom: 16 }}>Descuento excede su limite ({maxDiscount}%). Requiere autorizacion de Gerente.</p>
            <input
              className="pay-input"
              type="password"
              placeholder="Contrasena del gerente"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              style={{ marginBottom: 12, textAlign: "center" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="back-btn" onClick={() => setShowDescAuth(false)}>Cancelar</button>
              <button className="btn-action" onClick={() => { setShowDescAuth(false); setAuthPassword(""); }}>Autorizar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

