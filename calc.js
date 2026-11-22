// La Dupla Admin · Motores de cálculo (costos F2, modelo financiero F3 y vistas LD).
// Funciones puras: reciben los registros ya leídos y devuelven estructuras para pintar.
// Reproducen las fórmulas de los libros de Excel originales.
(function (root) {
  'use strict';
  const LDm = typeof module !== 'undefined' && module.exports ? require('./modulos.js') : root.LD;
  const { n, r2 } = LDm.util;
  const norm = (s) => String(s === null || s === undefined ? '' : s).trim().toLowerCase();
  const vivos = (filas) => (filas || []).filter((r) => r.estado !== 'anulado');
  const reciente = (a, b) => (a.fecha === b.fecha ? (a.creado_en < b.creado_en ? -1 : 1) : (a.fecha < b.fecha ? -1 : 1));
  const ultimo = (filas) => { const v = vivos(filas).slice().sort(reciente); return v.length ? v[v.length - 1].datos : {}; };
  const sum = (arr, fn) => arr.reduce((a, x) => a + (fn(x) || 0), 0);

  // ------------------------------------------------------------------ F2 · Costos
  function motorCostos(src) {
    const params = ultimo(src.f2_parametros);
    const insumos = new Map();
    vivos(src.f2_insumos).slice().sort(reciente).forEach((r) => { // el registro más reciente de cada insumo manda
      const d = r.datos; const costo = !n(d.factor) || n(d.precio) === null ? null : n(d.precio) / n(d.factor);
      insumos.set(norm(d.insumo), costo); if (d.codigo) insumos.set(norm(d.codigo), costo);
    });
    const recetas = new Map();
    vivos(src.f2_recetas).slice().sort(reciente).forEach((r) => recetas.set(norm(r.datos.receta_id), r.datos));
    const menus = new Map();
    vivos(src.f2_menu).slice().sort(reciente).forEach((r) => menus.set(norm(r.datos.sku), r.datos));

    function linea(ln, prof) {
      const cant = n(ln.cantidad); if (cant === null || !ln.componente) return null;
      if (ln.tipo === 'Sub-receta') {
        const sub = recetas.get(norm(ln.componente)); if (!sub || (prof || 0) > 4) return null;
        const c = receta(sub, (prof || 0) + 1).porcion; return c === null ? null : r2(c * cant);
      }
      const cu = insumos.get(norm(ln.componente)); return cu === null || cu === undefined ? null : r2(cu * cant);
    }
    function receta(d, prof) {
      const comps = d.componentes || [];
      if (!comps.length) return { materia: null, conMerma: null, porcion: null };
      let materia = 0;
      for (const ln of comps) { const c = linea(ln, prof); if (c === null) return { materia: null, conMerma: null, porcion: null }; materia += c; }
      const conMerma = materia * (1 + (n(d.merma) || 0));
      return { materia: r2(materia), conMerma: r2(conMerma), porcion: r2(conMerma / (n(d.rendimiento) || 1)) };
    }
    function menu(d) {
      const rec = recetas.get(norm(d.receta_id)); const precio = n(d.precio);
      const costo = rec ? receta(rec).porcion : null;
      if (costo === null || !precio) return { costo, margen: null, fc: null, costoTotal: null, margenRealPct: null };
      const ind = precio * (n(params.pct_indirecto) || 0);
      const total = costo + (n(d.empaque) || 0) + ind;
      return { costo, margen: r2(precio - costo), fc: costo / precio, costoTotal: r2(total), margenRealPct: (precio - total) / precio };
    }
    function promo(d) {
      const its = d.items || []; const pv = n(d.pv_combo);
      if (!its.length || !pv) return { costo: null, pvInd: null, descPct: null, margenPct: null };
      let costo = 0, pvInd = 0;
      for (const it of its) {
        const m = menus.get(norm(it.sku)); const q = n(it.cantidad) || 1; if (!m) return { costo: null, pvInd: null, descPct: null, margenPct: null };
        const c = menu(m).costo; if (c === null) return { costo: null, pvInd: null, descPct: null, margenPct: null };
        costo += c * q; pvInd += (n(m.precio) || 0) * q;
      }
      return { costo: r2(costo), pvInd: r2(pvInd), descPct: pvInd ? (pvInd - pv) / pvInd : null, margenPct: (pv - costo) / pv };
    }
    return { linea, receta, menu, promo, params, menus, recetas, insumos };
  }

  function vistaF2(src) {
    const k = motorCostos(src); const p = k.params; const avisos = [];
    const items = Array.from(k.menus.values());
    if (!items.length) return { avisos: ['Aún no hay productos en "Menú y precios". Captura insumos, recetas y menú para ver el tablero.'], bloques: [] };
    const filas = items.map((d) => Object.assign({ d }, k.menu(d)));
    const conCosto = filas.filter((x) => x.costo !== null && n(x.d.precio));
    if (conCosto.length < filas.length) avisos.push((filas.length - conCosto.length) + ' producto(s) sin costo calculable (falta receta o costo de algún insumo); se excluyen de los ponderados.');
    const mixTotal = sum(conCosto, (x) => n(x.d.mix));
    if (Math.abs(mixTotal - 1) > 0.005) avisos.push('El mix % esperado suma ' + (mixTotal * 100).toFixed(1) + '%; debe sumar 100% para que los ponderados sean correctos.');
    const sp = (fn) => sum(conCosto, (x) => fn(x) * (n(x.d.mix) || 0));
    const ticket = sp((x) => n(x.d.precio)); const margenPond = sp((x) => x.margen);
    const fcPond = ticket ? sp((x) => x.costo) / ticket : null;
    const bloques = [{ titulo: 'Indicadores clave del menú', kpis: [
      { l: 'Food cost ponderado', v: fcPond, f: 'pct' }, { l: 'Ticket promedio ponderado', v: ticket || null, f: 'dinero' },
      { l: 'Margen de contribución ponderado', v: margenPond || null, f: 'dinero' }, { l: 'Margen de contribución %', v: ticket ? margenPond / ticket : null, f: 'pct' },
      { l: 'Productos en menú', v: filas.length, f: 'num' }, { l: 'Productos con food cost > 35%', v: conCosto.filter((x) => x.fc > 0.35).length, f: 'num' }] }];
    const req = ['trans_dia', 'dias_mes', 'renta', 'nomina', 'servicios', 'marketing', 'otros'];
    if (req.every((c) => n(p[c]) !== null) && ticket) {
      const fcObj = n(p.food_cost_obj) !== null ? n(p.food_cost_obj) : fcPond;
      const ventas = n(p.trans_dia) * n(p.dias_mes) * ticket; const costo = ventas * fcObj; const bruto = ventas - costo;
      const fijos = n(p.renta) + n(p.nomina) + n(p.servicios) + n(p.marketing) + n(p.otros); const util = bruto - fijos;
      const peVentas = fijos / (1 - fcObj);
      bloques.push({ titulo: 'Rentabilidad proyectada por sucursal', kpis: [
        { l: 'Ventas mensuales estimadas', v: ventas, f: 'dinero' }, { l: 'Costo de venta mensual', v: costo, f: 'dinero' }, { l: 'Margen bruto mensual', v: bruto, f: 'dinero' },
        { l: 'Gastos fijos mensuales', v: fijos, f: 'dinero' }, { l: 'Utilidad operativa mensual', v: util, f: 'dinero' }, { l: 'Margen operativo %', v: ventas ? util / ventas : null, f: 'pct' },
        { l: 'Punto de equilibrio (ventas $/mes)', v: peVentas, f: 'dinero' }, { l: 'Punto de equilibrio (transacciones/mes)', v: peVentas / ticket, f: 'num' },
        { l: 'Punto de equilibrio (días de venta/mes)', v: peVentas / ticket / n(p.trans_dia), f: 'num1' }] });
      bloques.push({ titulo: 'Proyección 3 sucursales', kpis: [{ l: 'Ventas mensuales', v: ventas * 3, f: 'dinero' }, { l: 'Utilidad operativa mensual', v: util * 3, f: 'dinero' },
        { l: 'Utilidad anual', v: util * 36, f: 'dinero' }] });
    } else avisos.push('Completa "Parámetros de costos" (transacciones, días, renta, nómina, servicios, marketing, otros) para ver la rentabilidad proyectada.');
    bloques.push({ titulo: 'Rentabilidad por producto', tabla: {
      cols: ['SKU', 'Categoría', 'Producto', 'Precio', 'Costo receta', 'Food cost %', 'Estado', 'Costo total', 'Margen real %', 'Mix %', 'Aporte venta', 'Aporte margen'],
      fmts: ['txt', 'txt', 'txt', 'dinero', 'dinero', 'pct', 'txt', 'dinero', 'pct', 'pct', 'dinero', 'dinero'],
      filas: filas.map((x) => [x.d.sku, x.d.categoria, x.d.producto, n(x.d.precio), x.costo, x.fc, LDm.util.estadoFC(x.fc), x.costoTotal, x.margenRealPct, n(x.d.mix),
        n(x.d.precio) && n(x.d.mix) ? n(x.d.precio) * n(x.d.mix) : null, x.margen !== null && n(x.d.mix) ? x.margen * n(x.d.mix) : null]) } });
    return { avisos, bloques };
  }

  // ------------------------------------------------------------------ F3 · Financiero
  const F3_REQ = ['S_trans_dia', 'S_ticket', 'S_dias_mes', 'S_food_cost', 'R_mes_1', 'R_mes_2', 'R_mes_3', 'R_mes_4', 'R_mes_5', 'R_mes_6mas', 'G_renta', 'G_nomina',
    'Apertura_Suc1', 'Apertura_Suc2', 'Apertura_Suc3'];
  function modeloF3(s, capexFilas, over) {
    s = Object.assign({}, s, over || {});
    const g = (k) => n(s[k]) || 0;
    const esc = s.Escenario || 'Base';
    const factor = esc === 'Pesimista' ? (n(s.F_ventas_pes) || 1) : esc === 'Optimista' ? (n(s.F_ventas_opt) || 1) : 1;
    const fc = esc === 'Pesimista' && n(s.FC_pes) !== null ? n(s.FC_pes) : esc === 'Optimista' && n(s.FC_opt) !== null ? n(s.FC_opt) : g('S_food_cost');
    const G = g('G_renta') + g('G_nomina') + g('G_servicios') + g('G_mkt_pror') + g('G_otros');
    const Cc = g('C_nomina') + g('C_renta') + g('C_servicios') + g('C_transporte');
    const X = g('X_admin') + g('X_mkt_core') + g('X_pauta') + g('X_pos') + g('X_contador') + g('X_otros');
    const rampa = [g('R_mes_1'), g('R_mes_2'), g('R_mes_3'), g('R_mes_4'), g('R_mes_5'), g('R_mes_6mas')];
    const ap = [g('Apertura_Suc1'), g('Apertura_Suc2'), g('Apertura_Suc3')];
    const madura = g('S_trans_dia') * g('S_ticket') * g('S_dias_mes') * factor;
    const meses = Array.from({ length: 24 }, (_, i) => i + 1);
    const suc = meses.map((m) => { const r = rampa[Math.min(m, 6) - 1]; const ventas = madura * r; const costo = -ventas * fc;
      return { m, rampa: r, trans: g('S_trans_dia') * factor * r, ventas, costo, bruta: ventas + costo, fijos: -G, ebitda: ventas + costo - G }; });
    const con = meses.map((m) => {
      const activas = ap.filter((a) => a && m >= a).length;
      const v = ap.map((a) => (!a || m < a ? 0 : madura * rampa[Math.min(6, Math.max(1, m - a + 1)) - 1]));
      const ventas = v[0] + v[1] + v[2]; const costo = -ventas * fc; const bruta = ventas + costo;
      const fijos = -activas * G, central = activas ? -Cc : 0, corp = activas ? -X : 0; const ebitda = bruta + fijos + central + corp;
      return { m, activas, v, ventas, costo, bruta, fijos, central, corp, ebitda, margen: ventas ? ebitda / ventas : 0 };
    });
    const cx = vivos(capexFilas).map((r) => r.datos);
    const porSuc = sum(cx.filter((d) => d.tipo === 'Por sucursal'), (d) => n(d.monto));
    const comp = sum(cx.filter((d) => d.tipo === 'Compartido'), (d) => n(d.monto));
    const hundido = sum(cx.filter((d) => d.tipo === 'Hundido'), (d) => n(d.monto));
    const capex = { porSuc, comp, hundido, suc1: porSuc + comp, suc2: ap[1] ? porSuc : 0, suc3: ap[2] ? porSuc : 0 };
    capex.total = capex.suc1 + capex.suc2 + capex.suc3;
    const flujo = [{ m: 0, capex: -capex.suc1, ebitda: 0, neto: -capex.suc1, acum: -capex.suc1 }];
    meses.forEach((m) => { const c = (ap[1] && m === ap[1] - 1 ? -capex.suc2 : 0) + (ap[2] && m === ap[2] - 1 ? -capex.suc3 : 0);
      const e = con[m - 1].ebitda; const neto = c + e; flujo.push({ m, capex: c, ebitda: e, neto, acum: flujo[flujo.length - 1].acum + neto }); });
    const mc = 1 - fc; const tk = g('S_ticket'), dm = g('S_dias_mes'), td = g('S_trans_dia');
    const be = (fijos) => { const ventas = mc > 0 ? fijos / mc : null; const tm = ventas !== null && tk ? ventas / tk : null; const tdia = tm !== null && dm ? tm / dm : null;
      return { fijos, mc, ventas, transMes: tm, transDia: tdia, seguridad: tdia !== null && td ? 1 - tdia / td : null }; };
    const ebitdaMaduro3 = 3 * madura * mc - 3 * G - Cc - X;
    return { s, esc, factor, fc, G, Cc, X, suc, con, capex, flujo, be1: be(G + Cc + X), be3: be(G + Cc / 3 + X / 3), ebitdaMaduro3, madura };
  }

  function vistaF3(src) {
    const s = ultimo(src.f3_supuestos);
    const faltan = F3_REQ.filter((k) => n(s[k]) === null);
    if (faltan.length) return { avisos: ['Captura los supuestos del modelo (faltan ' + faltan.length + ' valores obligatorios) para ver el P&L, el flujo y el punto de equilibrio.'], bloques: [] };
    const M = modeloF3(s, src.f3_capex); const avisos = [];
    if (!vivos(src.f3_capex).length) avisos.push('No hay conceptos de CAPEX capturados: el flujo de efectivo se muestra sin inversión inicial.');
    const col = ['Concepto'].concat(M.con.map((x) => 'M' + x.m)); const fm = ['txt'].concat(M.con.map(() => 'dinero0'));
    const fila = (l, fn, arr) => [l].concat((arr || M.con).map(fn));
    const minAcum = Math.min.apply(null, M.flujo.map((x) => x.acum));
    const cruce = M.flujo.find((x, i) => i > 0 && x.acum >= 0 && M.flujo[i - 1].acum < 0);
    const bloques = [
      { titulo: 'Indicadores financieros · escenario ' + M.esc, kpis: [
        { l: 'Ventas mes 1', v: M.con[0].ventas, f: 'dinero0' }, { l: 'Ventas mes 6', v: M.con[5].ventas, f: 'dinero0' }, { l: 'Ventas mes 12', v: M.con[11].ventas, f: 'dinero0' }, { l: 'Ventas mes 24', v: M.con[23].ventas, f: 'dinero0' },
        { l: 'EBITDA mes 1', v: M.con[0].ebitda, f: 'dinero0' }, { l: 'EBITDA mes 6', v: M.con[5].ebitda, f: 'dinero0' }, { l: 'EBITDA mes 12', v: M.con[11].ebitda, f: 'dinero0' }, { l: 'EBITDA mes 24', v: M.con[23].ebitda, f: 'dinero0' },
        { l: 'CAPEX nuevo requerido', v: M.capex.total, f: 'dinero0' }, { l: 'Inversión hundida', v: M.capex.hundido, f: 'dinero0' },
        { l: 'Necesidad máxima de capital', v: minAcum < 0 ? -minAcum : 0, f: 'dinero0' }, { l: 'Mes en que el flujo acumulado cruza cero', v: cruce ? 'Mes ' + cruce.m : 'No cruza en 24 meses', f: 'txt' },
        { l: 'Saldo de caja mes 12', v: M.flujo[12].acum, f: 'dinero0' }, { l: 'Saldo de caja mes 24', v: M.flujo[24].acum, f: 'dinero0' },
        { l: 'Ventas acumuladas 24 meses', v: sum(M.con, (x) => x.ventas), f: 'dinero0' }, { l: 'EBITDA acumulado 24 meses', v: M.con.reduce((a, x) => a + x.ebitda, 0), f: 'dinero0' }] },
      { titulo: 'P&L mensual por sucursal individual (sin asignación central ni corporativa)', tabla: { cols: col, fmts: ['txt'].concat(M.suc.map(() => 'dinero0')), filas: [
        ['% capacidad (rampa)'].concat(M.suc.map((x) => (x.rampa * 100).toFixed(0) + '%')), fila('Transacciones por día', (x) => String(Math.round(x.trans)), M.suc), fila('Ventas brutas', (x) => x.ventas, M.suc),
        fila('Costo de venta', (x) => x.costo, M.suc), fila('Utilidad bruta', (x) => x.bruta, M.suc), fila('Gastos fijos sucursal', (x) => x.fijos, M.suc), fila('EBITDA sucursal', (x) => x.ebitda, M.suc)] } },
      { titulo: 'P&L consolidado · 24 meses', tabla: { cols: col, fmts: fm, filas: [
        fila('# Sucursales activas', (x) => String(x.activas)), fila('Ventas sucursal 1', (x) => x.v[0]), fila('Ventas sucursal 2', (x) => x.v[1]), fila('Ventas sucursal 3', (x) => x.v[2]),
        fila('VENTAS TOTALES', (x) => x.ventas), fila('Costo de venta total', (x) => x.costo), fila('UTILIDAD BRUTA', (x) => x.bruta), fila('Gastos fijos sucursales', (x) => x.fijos),
        fila('Producción central', (x) => x.central), fila('Gastos corporativos', (x) => x.corp), fila('EBITDA CONSOLIDADO', (x) => x.ebitda),
        fila('Margen EBITDA %', (x) => (x.margen * 100).toFixed(1) + '%')] } },
      { titulo: 'Flujo de efectivo acumulado', tabla: { cols: ['Concepto'].concat(M.flujo.map((x) => 'M' + x.m)), fmts: ['txt'].concat(M.flujo.map(() => 'dinero0')), filas: [
        ['CAPEX'].concat(M.flujo.map((x) => x.capex)), ['EBITDA'].concat(M.flujo.map((x) => x.ebitda)), ['Flujo neto mensual'].concat(M.flujo.map((x) => x.neto)),
        ['Flujo acumulado'].concat(M.flujo.map((x) => x.acum))] } }];
    const beT = (t, b) => ({ titulo: t, kpis: [{ l: 'Total de fijos asignados', v: b.fijos, f: 'dinero0' }, { l: 'Margen de contribución', v: b.mc, f: 'pct' }, { l: 'Ventas de equilibrio mensual', v: b.ventas, f: 'dinero0' },
      { l: 'Transacciones de equilibrio / mes', v: b.transMes, f: 'num' }, { l: 'Transacciones de equilibrio / día', v: b.transDia, f: 'num1' }, { l: 'Transacciones objetivo / día', v: n(s.S_trans_dia), f: 'num' },
      { l: 'Margen de seguridad', v: b.seguridad, f: 'pct' }] });
    bloques.push(beT('Punto de equilibrio · 1 sucursal abierta (carga toda la estructura)', M.be1), beT('Punto de equilibrio por sucursal · 3 sucursales abiertas', M.be3));
    // Escenarios
    const escF = ['Pesimista', 'Base', 'Optimista'].map((e) => {
      const tkE = e === 'Pesimista' ? n(s.T_ticket_pes) : e === 'Optimista' ? n(s.T_ticket_opt) : null;
      const m = modeloF3(s, src.f3_capex, Object.assign({ Escenario: e }, tkE !== null ? { S_ticket: tkE } : {}));
      return { e, m };
    });
    bloques.push({ titulo: 'Comparativo de escenarios', tabla: { cols: ['Métrica', 'Pesimista', 'Base', 'Optimista'], fmts: ['txt', 'num2', 'num2', 'num2'], filas: [
      ['Factor de ventas'].concat(escF.map((x) => x.m.factor)), ['Food cost ponderado'].concat(escF.map((x) => (x.m.fc * 100).toFixed(1) + '%')),
      ['Transacciones/día madura'].concat(escF.map((x) => String(Math.round(n(s.S_trans_dia) * x.m.factor)))), ['Ticket promedio'].concat(escF.map((x) => n(x.m.s.S_ticket))),
      ['Ventas mensuales madura por sucursal'].concat(escF.map((x) => Math.round(x.m.madura))), ['EBITDA mensual maduro (3 sucursales)'].concat(escF.map((x) => Math.round(x.m.ebitdaMaduro3))),
      ['Saldo de caja mes 24'].concat(escF.map((x) => Math.round(x.m.flujo[24].acum)))] } });
    // Sensibilidad sobre EBITDA mensual con 3 sucursales maduras
    const base = M.ebitdaMaduro3; const sens = (l, c, over) => { const e = modeloF3(s, src.f3_capex, over).ebitdaMaduro3; return [l, c, e, e - base, base ? (e - base) / Math.abs(base) : null]; };
    const g = (k) => n(s[k]) || 0;
    bloques.push({ titulo: 'Análisis de sensibilidad · EBITDA mensual con 3 sucursales maduras (escenario activo)', tabla: {
      cols: ['Variable', 'Cambio', 'EBITDA', 'Delta $', 'Delta %'], fmts: ['txt', 'txt', 'dinero0', 'dinero0', 'pct'], filas: [
        ['Base (referencia)', '—', base, 0, 0],
        sens('Transacciones/día', '−20%', { S_trans_dia: g('S_trans_dia') * 0.8 }), sens('Transacciones/día', '−10%', { S_trans_dia: g('S_trans_dia') * 0.9 }),
        sens('Transacciones/día', '+10%', { S_trans_dia: g('S_trans_dia') * 1.1 }), sens('Transacciones/día', '+20%', { S_trans_dia: g('S_trans_dia') * 1.2 }),
        sens('Ticket promedio', '−10%', { S_ticket: g('S_ticket') * 0.9 }), sens('Ticket promedio', '+10%', { S_ticket: g('S_ticket') * 1.1 }),
        sens('Food cost', '+3 pp', { S_food_cost: g('S_food_cost') + 0.03, FC_pes: n(s.FC_pes) !== null ? n(s.FC_pes) + 0.03 : null, FC_opt: n(s.FC_opt) !== null ? n(s.FC_opt) + 0.03 : null }),
        sens('Food cost', '−2 pp', { S_food_cost: g('S_food_cost') - 0.02, FC_pes: n(s.FC_pes) !== null ? n(s.FC_pes) - 0.02 : null, FC_opt: n(s.FC_opt) !== null ? n(s.FC_opt) - 0.02 : null }),
        sens('Nómina de sucursal', '+10%', { G_nomina: g('G_nomina') * 1.1 }), sens('Renta de sucursal', '+10%', { G_renta: g('G_renta') * 1.1 })] } });
    return { avisos, bloques };
  }

  // ------------------------------------------------------------------ LD-08 · Ventas
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const fechaObj = (f) => new Date(f + 'T12:00:00');
  function ventasBase(src) {
    const p = ultimo(src.ld08_parametros);
    const dias = vivos(src.ld08_ventas_diarias).map((r) => ({ f: r.fecha, mes: r.fecha.slice(0, 7), venta: n(r.datos.venta_neta) || 0, cuentas: n(r.datos.cuentas) || 0,
      efPos: n(r.datos.efectivo_pos) || 0, efMan: n(r.datos.efectivo_manual), dow: fechaObj(r.fecha).getDay() }))
      .filter((d) => d.cuentas > 0 && (!p.apertura || d.f >= p.apertura)).sort((a, b) => (a.f < b.f ? -1 : 1));
    const porMes = new Map();
    dias.forEach((d) => { const m = porMes.get(d.mes) || { mes: d.mes, dias: 0, venta: 0, cuentas: 0 }; m.dias++; m.venta += d.venta; m.cuentas += d.cuentas; porMes.set(d.mes, m); });
    const meses = Array.from(porMes.values()).map((m) => Object.assign(m, { tpd: m.cuentas / m.dias, ticket: m.cuentas ? m.venta / m.cuentas : null }));
    return { p, dias, meses };
  }
  function vistaVentas(src) {
    const { p, dias, meses } = ventasBase(src);
    if (!dias.length) return { avisos: ['Aún no hay ventas diarias capturadas.'], bloques: [] };
    const mezcla = new Map(vivos(src.ld08_mezcla_mensual).map((r) => [r.datos.mes, r.datos]));
    const bloques = [{ titulo: 'Resumen mensual', tabla: { cols: ['Mes', 'Días con venta', 'Venta neta', 'Cuentas', 'Tickets por día', 'Ticket neto', '% bebidas', '% cortesías + descuentos'],
      fmts: ['txt', 'num', 'dinero', 'num', 'num1', 'dinero', 'pct', 'pct'], filas: meses.map((m) => { const z = mezcla.get(m.mes) || {}; const t = (n(z.alimentos) || 0) + (n(z.bebidas) || 0) + (n(z.otros) || 0);
        return [m.mes, m.dias, m.venta, m.cuentas, m.tpd, m.ticket, t ? (n(z.bebidas) || 0) / t : null, t ? ((n(z.cortesias) || 0) + (n(z.descuentos) || 0)) / t : null]; }) } }];
    const pers = n(p.pers_turno);
    const lvProm = (() => { const lv = [1, 2, 3, 4, 5].map((w) => { const x = dias.filter((d) => d.dow === w); return x.length ? sum(x, (d) => d.venta) / x.length : null; }).filter((x) => x !== null);
      return lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : null; })();
    bloques.push({ titulo: 'Patrón por día de la semana', tabla: { cols: ['Día', 'Días operativos', 'Tickets promedio', 'Venta neta promedio', 'Horas-persona de barra', 'Tickets por hora-persona', '% vs promedio L–V'],
      fmts: ['txt', 'num', 'num1', 'dinero', 'num', 'num2', 'pct'], filas: [1, 2, 3, 4, 5, 6, 0].map((w) => { const x = dias.filter((d) => d.dow === w); if (!x.length) return [DIAS[w], 0, null, null, null, null, null];
        const tp = sum(x, (d) => d.cuentas) / x.length, vp = sum(x, (d) => d.venta) / x.length; const hp = pers === null ? null : (w === 0 || w === 6 ? pers * 7 : 2 * pers * 8);
        return [DIAS[w], x.length, tp, vp, hp, hp ? tp / hp : null, lvProm ? vp / lvProm : null]; }) } });
    const sem = new Map();
    dias.forEach((d) => { const t = fechaObj(d.f); const off = (t.getDay() + 6) % 7; t.setDate(t.getDate() - off); const k = t.toISOString().slice(0, 10);
      const s = sem.get(k) || { k, venta: 0, cuentas: 0, dias: 0 }; s.venta += d.venta; s.cuentas += d.cuentas; s.dias++; sem.set(k, s); });
    const semanas = Array.from(sem.values()).sort((a, b) => (a.k < b.k ? -1 : 1));
    bloques.push({ titulo: 'Tendencia semanal (lunes a domingo)', tabla: { cols: ['Lunes de la semana', 'Venta neta', 'Tickets', 'Días con venta', 'Tickets por día', 'Ticket neto', 'Venta vs semana anterior'],
      fmts: ['txt', 'dinero', 'num', 'num', 'num1', 'dinero', 'pct'], filas: semanas.map((s, i) => [s.k, s.venta, s.cuentas, s.dias, s.cuentas / s.dias, s.cuentas ? s.venta / s.cuentas : null,
        i && semanas[i - 1].venta ? s.venta / semanas[i - 1].venta - 1 : null]) } });
    return { avisos: [], bloques };
  }
  function vistaEquilibrio(src) {
    const { p, meses } = ventasBase(src); const avisos = [];
    if (!meses.length) return { avisos: ['Aún no hay ventas diarias capturadas.'], bloques: [] };
    const req = ['fc', 'nomina', 'otros_suc', 'central', 'corp', 'dias_mes'].filter((k) => n(p[k]) === null);
    if (req.length) return { avisos: ['Completa los parámetros de LD-08 (food cost, nómina, fijos, central, corporativo y días del mes) para calcular el punto de equilibrio.'], bloques: [] };
    const m = meses[meses.length - 1]; const fc = n(p.fc);
    const esc = (corp) => { const fijos = n(p.nomina) + n(p.otros_suc) + n(p.central) + corp; const pe = fijos / (1 - fc); const peT = pe / m.ticket / n(p.dias_mes); const bruto = m.venta * (1 - fc);
      return [fijos, pe, peT, m.tpd, m.tpd / peT, m.venta, bruto, bruto - fijos, bruto - n(p.nomina), pe / m.venta]; };
    const a = esc(0), b = esc(n(p.corp));
    const et = ['Total de gastos fijos mensuales', 'Punto de equilibrio en venta neta ($/mes)', 'Punto de equilibrio en tickets por día', 'Tickets por día reales', 'Cobertura del equilibrio (real / necesario)',
      'Venta neta del mes', 'Margen bruto con el food cost de parámetros', 'Resultado antes de impuestos estimado', 'Resultado solo contra la nómina real', 'Venta necesaria vs la real (veces)'];
    const ff = ['dinero0', 'dinero0', 'num1', 'num1', 'pct', 'dinero0', 'dinero0', 'dinero0', 'dinero0', 'num2'];
    const bloques = [{ titulo: 'Punto de equilibrio y resultado estimado · ' + m.mes, tabla: { cols: ['Concepto', 'A: sin corporativo', 'B: con corporativo'], fmts: ['txt', 'mixto', 'mixto'],
      filas: et.map((l, i) => [l, { v: a[i], f: ff[i] }, { v: b[i], f: ff[i] }]) } }];
    bloques.push({ titulo: 'Sensibilidad al food cost (escenario A)', tabla: { cols: ['Food cost', 'PE venta neta ($/mes)', 'PE tickets/día', 'Resultado estimado ($/mes)'], fmts: ['pct', 'dinero0', 'num1', 'dinero0'],
      filas: [0.25, 0.30, 0.35, 0.40].map((f) => { const fijos = a[0]; const pe = fijos / (1 - f); return [f, pe, pe / m.ticket / n(p.dias_mes), m.venta * (1 - f) - fijos]; }) } });
    const s = ultimo(src.f3_supuestos);
    if (n(s.S_trans_dia) !== null && n(s.S_ticket) !== null && p.apertura) {
      const ini = p.apertura.slice(0, 7); const k = (Number(m.mes.slice(0, 4)) - Number(ini.slice(0, 4))) * 12 + Number(m.mes.slice(5)) - Number(ini.slice(5)) + 1;
      const ramp = [s.R_mes_1, s.R_mes_2, s.R_mes_3, s.R_mes_4, s.R_mes_5, s.R_mes_6mas].map(n)[Math.min(Math.max(k, 1), 6) - 1];
      if (ramp !== null && ramp !== undefined) {
        const f3m = n(s.S_trans_dia) * ramp;
        bloques.push({ titulo: 'Real vs modelo financiero F3 · mes ' + k + ' desde la apertura', tabla: { cols: ['Variable', 'F3 sucursal madura', 'F3 mes ' + k, 'Real', 'Real / F3 mes', 'Real / F3 madura'],
          fmts: ['txt', 'num1', 'num1', 'num1', 'pct', 'pct'], filas: [['Tickets por día', n(s.S_trans_dia), f3m, m.tpd, m.tpd / f3m, m.tpd / n(s.S_trans_dia)],
            ['Ticket promedio ($)', n(s.S_ticket), n(s.S_ticket), m.ticket, m.ticket / n(s.S_ticket), m.ticket / n(s.S_ticket)],
            ['Venta por día ($)', n(s.S_trans_dia) * n(s.S_ticket), f3m * n(s.S_ticket), m.venta / m.dias, (m.venta / m.dias) / (f3m * n(s.S_ticket)), (m.venta / m.dias) / (n(s.S_trans_dia) * n(s.S_ticket))]] } });
        if (n(p.gatillo) !== null) bloques.push({ titulo: 'Gatillo de apertura de la siguiente sucursal', kpis: [{ l: 'Gatillo (tickets/día)', v: n(p.gatillo), f: 'num' }, { l: 'Tickets por día reales', v: m.tpd, f: 'num1' },
          { l: 'Avance contra el gatillo', v: m.tpd / n(p.gatillo), f: 'pct' }] });
      }
    } else avisos.push('Para comparar contra F3 captura los supuestos de F3 y la fecha de apertura en los parámetros de LD-08.');
    return { avisos, bloques };
  }
  function vistaEfectivo(src) {
    const dias = vivos(src.ld08_ventas_diarias); const ent = vivos(src.ld08_efectivo_entregas);
    if (!dias.length && !ent.length) return { avisos: ['Aún no hay ventas ni entregas de efectivo capturadas.'], bloques: [] };
    const mm = new Map(); const get = (k) => { if (!mm.has(k)) mm.set(k, { k, pos: 0, man: 0, ent: 0, rec: 0, sinRev: 0 }); return mm.get(k); };
    dias.forEach((r) => { const x = get(r.fecha.slice(0, 7)); x.pos += n(r.datos.efectivo_pos) || 0; x.man += n(r.datos.efectivo_manual) || 0; });
    ent.forEach((r) => { const x = get(r.fecha.slice(0, 7)); x.ent += n(r.datos.monto) || 0; if (r.estado === 'revisado') x.rec += n((r.revision || {}).monto_recibido) || 0; else x.sinRev++; });
    const f = Array.from(mm.values()).sort((a, b) => (a.k < b.k ? -1 : 1));
    return { avisos: ['El efectivo "recibido" solo cuenta entregas ya revisadas por quien las recibió (persona distinta de quien entregó).'], bloques: [{ titulo: 'Efectivo: POS vs hoja manual vs entregas', tabla: {
      cols: ['Mes', 'Efectivo según POS', 'Efectivo hoja manual', 'Hoja manual − POS', 'Entregado', 'Recibido (revisado)', 'Entregado − POS', 'Entregas sin revisar'],
      fmts: ['txt', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'num'], filas: f.map((x) => [x.k, x.pos, x.man, x.man - x.pos, x.ent, x.rec, x.ent - x.pos, x.sinRev]) } }] };
  }

  // ------------------------------------------------------------------ LD-01 / LD-06
  function vistaInventario(src, extra) {
    const filas = vivos(src.ld01_inv_conteos);
    if (!filas.length) return { avisos: ['Aún no hay conteos de inventario capturados.'], bloques: [] };
    const tol = n(ultimo(src.ld01_parametros).tol_inv);
    const costos = extra && extra.costos ? extra.costos.insumosCompra : null;
    const g = new Map();
    filas.forEach((r) => { const d = r.datos; const k = [r.fecha, d.ubicacion, norm(d.insumo)].join('|');
      const x = g.get(k) || { fecha: r.fecha, ubic: d.ubicacion, insumo: d.insumo, unidad: d.unidad, c: {}, por: {} };
      const num = String(d.conteo || '').charAt(0); x.c[num] = n(d.cantidad); x.por[num] = r.creado_por; g.set(k, x); });
    let total = 0; const avisos = [];
    const out = Array.from(g.values()).sort((a, b) => (a.fecha === b.fecha ? (a.insumo < b.insumo ? -1 : 1) : (a.fecha < b.fecha ? 1 : -1))).map((x) => {
      const c1 = x.c['1'], c2 = x.c['2'], c3 = x.c['3']; const has = (v) => v !== null && v !== undefined;
      const dif = has(c1) && has(c2) ? Math.abs(c1 - c2) : null; const base = has(c1) && has(c2) ? Math.max(Math.abs(c1), Math.abs(c2)) : null;
      const pct = dif !== null && base ? dif / base : (dif === 0 ? 0 : null);
      const final = has(c3) ? c3 : has(c1) && has(c2) ? r2((c1 + c2) / 2) : has(c1) ? c1 : null;
      let est = !has(c2) ? 'Falta conteo 2' : (tol !== null && pct !== null && pct > tol ? (has(c3) ? 'Recontado' : 'Excede tolerancia: requiere recuento') : 'Conciliado');
      if (has(c1) && has(c2) && x.por['1'] === x.por['2']) est = '⚠ Conteos 1 y 2 de la misma persona';
      const pu = costos ? costos.get(norm(x.insumo)) : undefined; const valor = pu !== undefined && pu !== null && final !== null ? r2(final * pu) : null; if (valor) total += valor;
      return [x.fecha, x.ubic, x.insumo, x.unidad, has(c1) ? c1 : null, has(c2) ? c2 : null, dif, pct, has(c3) ? c3 : null, final, valor, est];
    });
    if (tol === null) avisos.push('Define la tolerancia de diferencia entre conteos en Parámetros de LD-01.');
    const bloques = [];
    if (costos) bloques.push({ titulo: 'Valor del inventario', kpis: [{ l: 'Valor total conciliado', v: total, f: 'dinero' }] });
    bloques.push({ titulo: 'Conciliación de conteos', tabla: { cols: ['Fecha', 'Ubicación', 'Insumo', 'Unidad', 'Conteo 1', 'Conteo 2', 'Dif. 1 vs 2', '% dif.', 'Recuento', 'Cantidad final', 'Valor', 'Estado'],
      fmts: ['txt', 'txt', 'txt', 'txt', 'num2', 'num2', 'num2', 'pct', 'num2', 'num2', 'dinero', 'txt'], filas: out } });
    return { avisos, bloques };
  }
  function vistaFondo(src) {
    const f = vivos(src.ld01_fondo_efectivo).slice().sort(reciente);
    if (!f.length) return { avisos: ['Aún no hay movimientos en el fondo de compras en efectivo.'], bloques: [] };
    let saldo = 0; const filas = f.map((r) => { saldo += (n(r.datos.ingreso) || 0) - (n(r.datos.egreso) || 0);
      return [r.fecha, r.datos.concepto, n(r.datos.ingreso), n(r.datos.egreso), r2(saldo), r.datos.comprobante || '', r.estado === 'revisado' ? 'Revisado' : 'Pendiente de revisión']; });
    return { avisos: [], bloques: [{ titulo: 'Saldo del fondo', kpis: [{ l: 'Saldo actual', v: r2(saldo), f: 'dinero' }, { l: 'Movimientos sin revisar', v: f.filter((r) => r.estado !== 'revisado').length, f: 'num' }] },
      { titulo: 'Movimientos', tabla: { cols: ['Fecha', 'Concepto / proveedor', 'Ingreso', 'Egreso', 'Saldo', 'Comprobante', 'Revisión'], fmts: ['txt', 'txt', 'dinero', 'dinero', 'dinero', 'txt', 'txt'], filas: filas.reverse() } }] };
  }
  function vistaDimensionamiento(src) {
    const p = ultimo(src.ld06_parametros); const req = ['pers_turno', 'turnos_dia_lv', 'turnos_dia_fds', 'dias_pago', 'baristas'].filter((k) => n(p[k]) === null);
    if (req.length) return { avisos: ['Captura los parámetros de dimensionamiento de LD-06 para ver el cálculo.'], bloques: [] };
    const lv = 5 * n(p.turnos_dia_lv), sd = 2 * n(p.turnos_dia_fds), reqT = (lv + sd) * n(p.pers_turno), pag = n(p.baristas) * n(p.dias_pago), br = reqT - pag;
    return { avisos: ['Brecha positiva = falta cobertura. Es una hipótesis hasta contar con el rol real y las ventas por hora.'], bloques: [{ titulo: 'Dimensionamiento preliminar de barra', tabla: {
      cols: ['Concepto', 'Valor', 'Cómo se calcula'], fmts: ['txt', 'num2', 'txt'], filas: [['Turnos L–V por semana', lv, '5 × turnos por día L–V'], ['Turnos S–D por semana', sd, '2 × turnos por día S–D'],
        ['Turnos-persona requeridos por semana', reqT, '(L–V + S–D) × personas por turno'], ['Turnos-persona pagados por semana', pag, 'baristas × días pagados'],
        ['Brecha (requeridos − pagados)', br, 'Positivo = falta cobertura'], ['Equivalente en baristas adicionales', n(p.dias_pago) ? br / n(p.dias_pago) : null, 'brecha ÷ días pagados']] } }] };
  }

  const VISTAS = { v_inv_conciliacion: vistaInventario, v_fondo_saldo: vistaFondo, v_dimensionamiento: vistaDimensionamiento, v_ventas_resumen: vistaVentas,
    v_punto_equilibrio: vistaEquilibrio, v_efectivo_conciliacion: vistaEfectivo, v_f2_tablero: vistaF2, v_f3_modelo: vistaF3 };
  const api = { motorCostos, modeloF3, VISTAS, ultimo, vivos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LDCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
