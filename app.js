// La Dupla Admin — aplicación. Todo el contenido dinámico se inserta como TEXTO (nunca innerHTML)
// para que lo capturado por cualquier usuario no pueda inyectar código. Los permisos que valen son
// los de la base de datos (RLS); la interfaz solo oculta lo que el usuario de todos modos no puede hacer.
(() => {
  'use strict';
  const cfg = window.LADUPLA_CONFIG || {};
  const listo = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl || '') && !!cfg.supabaseKey;
  const db = listo ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  const { ROLES, LIBROS, MODULOS, VISTAS, util } = window.LD;
  const { n } = util;
  const MOD = new Map(MODULOS.map((m) => [m.clave, m]));
  const $ = (id) => document.getElementById(id);
  const INACTIVIDAD_MIN = 30;

  // ---------------------------------------------------------------- utilidades de DOM
  const nativeReplace = Element.prototype.replaceChildren;
  Element.prototype.replaceChildren = function (...kids) { return nativeReplace.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '')); };
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (['checked', 'disabled', 'selected', 'required', 'open'].includes(k)) el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid instanceof Node ? kid : document.createTextNode(String(kid))); }
    return el;
  }
  const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const masDias = (f, d) => { const t = new Date(f + 'T12:00:00'); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
  const fFecha = (d, hora) => (d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d).toLocaleString('es-MX', hora ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : '—');
  const nf = (min, max) => new Intl.NumberFormat('es-MX', { minimumFractionDigits: min, maximumFractionDigits: max });
  const mon = (d) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: d, maximumFractionDigits: d });
  function fmt(v, f) {
    if (v && typeof v === 'object' && 'f' in v) return fmt(v.v, v.f);
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string') return v;
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    switch (f) {
      case 'dinero': return mon(2).format(v); case 'dinero0': return mon(0).format(v); case 'dinero4': return mon(4).format(v);
      case 'pct': return nf(1, 1).format(v * 100) + '%'; case 'num1': return nf(1, 1).format(v); case 'num2': return nf(0, 2).format(v);
      default: return nf(0, 2).format(v);
    }
  }
  function toast(msg, tipo) {
    let box = $('toasts'); if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: 'toast ' + (tipo || '') }, msg); box.append(t); setTimeout(() => t.remove(), tipo === 'bad' ? 8000 : 3500);
  }
  function dialogo(titulo, cuerpo, acciones) {
    const d = h('dialog', {}, h('div', { class: 'dlg-head' }, h('h2', { class: 'grow' }, titulo), h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Cerrar', onclick: () => d.close() }, '✕')),
      h('div', { class: 'dlg-body' }, cuerpo), acciones && acciones.length ? h('div', { class: 'dlg-foot' }, acciones) : null);
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal(); return d;
  }
  const ERR = [[/Invalid login credentials/i, 'Correo o contraseña incorrectos.'], [/Email not confirmed/i, 'Confirma tu correo antes de entrar.'],
    [/row-level security|permission denied/i, 'No tienes permiso para esta operación.'], [/Failed to fetch|NetworkError/i, 'Sin conexión con el servidor. Revisa tu internet.'],
    [/JWT|token/i, 'Tu sesión expiró. Vuelve a entrar.'], [/revisor_distinto/i, 'Segregación de funciones: no puedes revisar tu propio registro.']];
  const msgErr = (e) => { const m = (e && (e.message || e.error_description)) || String(e); const hit = ERR.find(([re]) => re.test(m)); return hit ? hit[1] : m; };
  async function run(promesa, ok) {
    const { data, error } = await promesa;
    if (error) { toast(msgErr(error), 'bad'); throw error; }
    if (ok) toast(ok, 'ok'); return data;
  }

  // ---------------------------------------------------------------- estado de sesión
  let sesion = null, perfil = null, dir = new Map(), sucursales = [];
  const catCache = new Map(), filasCache = new Map();
  const puede = (modulo, accion) => !!(perfil && perfil.permisos && perfil.permisos[modulo] && perfil.permisos[modulo][accion]);
  const nombreDe = (id) => (dir.get(id) ? dir.get(id).nombre || '(sin nombre)' : '—');
  const rolesDe = (u) => (u && u.rol ? [u.rol].concat(u.roles_extra || []) : []);
  const esRol = (...r) => rolesDe(perfil).some((x) => r.includes(x));
  const rolesNombre = (u) => rolesDe(u).map((x) => ROLES[x]).join(' + ');

  async function leer(modulo, filtro) {
    if (!puede(modulo, 'ver')) return [];
    let q = db.from('registros').select('*').eq('modulo', modulo).order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(3000);
    if (filtro && filtro.desde) q = q.gte('fecha', filtro.desde);
    if (filtro && filtro.hasta) q = q.lte('fecha', filtro.hasta);
    if (filtro && filtro.sucursal) q = q.eq('sucursal_id', filtro.sucursal);
    return run(q);
  }
  async function leerTodo(modulo) { // con caché corta para cálculos cruzados
    const c = filasCache.get(modulo); if (c && Date.now() - c.t < 20000) return c.d;
    const d = await leer(modulo); filasCache.set(modulo, { t: Date.now(), d }); return d;
  }
  const invalidar = (modulo) => { filasCache.delete(modulo); catCache.delete(modulo); };
  async function catalogo(modulo) {
    if (catCache.has(modulo)) return catCache.get(modulo);
    const { data, error } = await db.rpc('catalogo', { p_modulo: modulo }); const d = error ? [] : (data || []);
    catCache.set(modulo, d); return d;
  }
  async function contexto(m) {
    const pm = MOD.get(m.libro + '_parametros'); let params = {};
    if (pm && puede(pm.clave, 'ver')) params = window.LDCalc.ultimo(await leerTodo(pm.clave));
    let costos = null;
    if (m.libro === 'f2' && puede('f2_insumos', 'ver')) {
      const src = {}; for (const k of ['f2_insumos', 'f2_recetas', 'f2_menu', 'f2_parametros']) src[k] = await leerTodo(k);
      costos = window.LDCalc.motorCostos(src);
    }
    return { params, costos, filas: [] };
  }

  // ---------------------------------------------------------------- campos de formulario
  function campoInput(c, valor, alCambiar) {
    const base = { id: 'f_' + c.k + '_' + Math.random().toString(36).slice(2, 7), required: !!c.req, oninput: alCambiar, onchange: alCambiar };
    let el;
    if (c.t === 'nota') el = h('textarea', Object.assign({ maxlength: 2000 }, base));
    else if (c.t === 'opcion') el = h('select', base, h('option', { value: '' }, '—'), c.o.map((o) => h('option', { value: o }, o)));
    else if (c.t === 'fecha') el = h('input', Object.assign({ type: 'date' }, base));
    else if (c.t === 'hora') el = h('input', Object.assign({ type: 'time' }, base));
    else if (c.t === 'mes') el = h('input', Object.assign({ type: 'month' }, base));
    else if (c.t === 'numero' || c.t === 'dinero' || c.t === 'pct') el = h('input', Object.assign({ type: 'number', step: 'any', inputmode: 'decimal' }, base));
    else if (c.t === 'ref') {
      const dl = h('datalist', { id: 'dl_' + base.id }); el = h('input', Object.assign({ type: 'text', list: dl.id, maxlength: 200, autocomplete: 'off' }, base)); el._dl = dl;
      catalogo(c.ref.m).then((items) => dl.replaceChildren(items.map((it) => h('option', { value: c.ref.etq.map((k) => it.datos[k]).filter(Boolean).join(' · ') }))));
    } else el = h('input', Object.assign({ type: 'text', maxlength: 300 }, base, c.patron ? { pattern: c.patron } : {}));
    if (valor !== undefined && valor !== null) el.value = c.t === 'pct' ? (n(valor) === null ? '' : Math.round(n(valor) * 1e6) / 1e4) : valor;
    el._leer = () => { const v = el.value.trim(); if (v === '') return null;
      if (c.t === 'numero' || c.t === 'dinero') return n(v); if (c.t === 'pct') return n(v) === null ? null : n(v) / 100; return v; };
    return el;
  }
  // Construye un formulario para una lista de campos. Devuelve { nodo, leer(), validar() }.
  function formulario(campos, datos, ctxCalc) {
    datos = datos || {}; const entradas = new Map(); const lineas = new Map(); const cajaCalc = h('div', { class: 'calcbox' });
    const calcs = campos.filter((c) => c.t === 'calc');
    const leer = () => { const o = {}; entradas.forEach((el, k) => { const v = el._leer(); if (v !== null) o[k] = v; }); lineas.forEach((L, k) => { const v = L.leer(); if (v.length) o[k] = v; }); return o; };
    const refrescar = () => { if (!calcs.length || !ctxCalc) return; const d = leer();
      cajaCalc.replaceChildren(calcs.map((c) => { let v = null; try { v = ctxCalc(c, d); } catch (e) { v = null; } return h('div', {}, c.l, h('b', {}, fmt(v, c.fmt))); }));
      lineas.forEach((L) => L.refrescar(d)); };
    const nodos = [];
    campos.forEach((c) => {
      if (c.t === 'calc') return;
      if (c.t === 'seccion') { nodos.push(h('div', { class: 'seccion' }, c.l)); return; }
      if (c.t === 'lineas') { const L = editorLineas(c, datos[c.k] || [], refrescar, ctxCalc); lineas.set(c.k, L); nodos.push(L.nodo); return; }
      const el = campoInput(c, datos[c.k], refrescar); entradas.set(c.k, el);
      nodos.push(h('label', { class: 'field' + (c.t === 'nota' ? ' wide' : '') }, c.l + (c.req ? ' *' : '') + (c.t === 'pct' ? ' (%)' : ''), el, el._dl || null));
    });
    const nodo = h('div', { class: 'form-grid' }, nodos, calcs.length && ctxCalc ? cajaCalc : null);
    refrescar();
    const validar = () => { for (const [, el] of entradas) { if (!el.checkValidity()) { el.reportValidity(); return false; } } return true; };
    return { nodo, leer, validar };
  }
  function editorLineas(c, inicial, alCambiar, ctxCalc) {
    const cont = h('div', { class: 'lineas' }); const filas = [];
    const agregar = (d) => { const ins = c.sub.map((s) => campoInput(s, (d || {})[s.k], alCambiar)); const res = h('b', { class: 'small' });
      const f = { ins, res }; const nodo = h('div', { class: 'ln' }, c.sub.map((s, i) => h('label', { class: 'field' }, s.l, ins[i], ins[i]._dl || null)),
        h('div', { class: 'row' }, res, h('button', { class: 'btn sm danger', type: 'button', onclick: () => { filas.splice(filas.indexOf(f), 1); nodo.remove(); alCambiar(); } }, 'Quitar')));
      filas.push(f); lista.append(nodo); };
    const lista = h('div', { class: 'lineas' });
    cont.append(h('div', { class: 'seccion' }, c.l), lista, h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: () => { agregar(); alCambiar(); } }, '+ Agregar renglón')));
    (inicial.length ? inicial : [{}]).forEach(agregar);
    const leerUna = (f) => { const o = {}; c.sub.forEach((s, i) => { const v = f.ins[i]._leer(); if (v !== null) o[s.k] = v; }); return o; };
    return { nodo: cont, leer: () => filas.map(leerUna).filter((o) => Object.keys(o).length),
      refrescar: (d) => { if (!c.calcLinea) return; filas.forEach((f) => { let v = null; try { v = c.calcLinea.fn(leerUna(f), d, ctxCalc ? ctxCalc.ctx : {}); } catch (e) { v = null; } f.res.textContent = c.calcLinea.l + ': ' + fmt(v, c.calcLinea.fmt); }); } };
  }
  function editorChecklist(m, datos) {
    const prev = (datos && datos.items) || {}; const filas = m.items.map((txt, i) => {
      const sel = h('select', { required: true }, h('option', { value: '' }, '—'), ['OK', 'Falla', 'N/A'].map((o) => h('option', { value: o }, o)));
      const obs = h('input', { type: 'text', maxlength: 300, placeholder: 'Observación' }); const p = prev[i + 1] || {}; if (p.e) sel.value = p.e; if (p.o) obs.value = p.o;
      return { sel, obs, nodo: h('div', { class: 'it' }, h('span', {}, (i + 1) + '. ' + txt), sel, obs) }; });
    return { nodo: h('div', { class: 'chk' }, filas.map((f) => f.nodo)),
      validar: () => { for (const f of filas) { if (!f.sel.value) { f.sel.reportValidity(); return false; } if (f.sel.value === 'Falla' && !f.obs.value.trim()) { f.obs.setCustomValidity('Describe la falla'); f.obs.reportValidity(); f.obs.setCustomValidity(''); return false; } } return true; },
      leer: () => { const o = {}; filas.forEach((f, i) => { o[i + 1] = Object.assign({ e: f.sel.value }, f.obs.value.trim() ? { o: f.obs.value.trim() } : {}); }); return o; } };
  }

  // ---------------------------------------------------------------- módulo (formato)
  const valorCalc = (c, reg, ctx) => { try { return c.calc(reg.datos || {}, ctx, reg.revision || {}, reg); } catch (e) { return null; } };
  const badgeEstado = (r) => h('span', { class: 'badge ' + (r.estado === 'revisado' ? 'ok' : r.estado === 'anulado' ? 'bad' : 'warn') }, r.estado === 'revisado' ? 'Revisado' : r.estado === 'anulado' ? 'Anulado' : 'Por revisar');
  const rolesTxt = (arr) => arr.map((r) => ROLES[r]).join(', ');
  function celda(c, reg, ctx) {
    if (c.t === 'calc') { const v = valorCalc(c, reg, ctx); return h('td', { class: (typeof v === 'number' ? 'num ' : '') + 'calc' + (typeof v === 'number' && v < 0 ? ' neg' : '') }, fmt(v, c.fmt)); }
    const v = (reg.datos || {})[c.k];
    if (c.t === 'lineas') return h('td', {}, (v || []).length + ' renglón(es)');
    if (c.t === 'dinero') return h('td', { class: 'num' }, fmt(n(v), 'dinero'));
    if (c.t === 'numero') return h('td', { class: 'num' }, fmt(n(v), 'num'));
    if (c.t === 'pct') return h('td', { class: 'num' }, fmt(n(v), 'pct'));
    if (c.t === 'fecha') return h('td', { class: 'nowrap' }, v ? fFecha(v) : '—');
    return h('td', { class: 'txt', title: v || '' }, v || '—');
  }
  function csv(nombre, cols, filas) {
    const esc = (v) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const txt = '﻿' + [cols.map(esc).join(',')].concat(filas.map((f) => f.map(esc).join(','))).join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })), download: nombre + '_' + hoy() + '.csv' }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function paginaModulo(m) {
    const view = $('view'); const libro = LIBROS.find((l) => l.clave === m.libro);
    const unico = m.tipo === 'unico';
    const desde = h('input', { type: 'date', value: masDias(hoy(), -31) }), hasta = h('input', { type: 'date', value: hoy() });
    const fEstado = h('select', {}, [['', 'Todos'], ['capturado', 'Por revisar'], ['revisado', 'Revisados'], ['anulado', 'Anulados']].map(([v, l]) => h('option', { value: v }, l)));
    const fSuc = sucursales.length ? h('select', {}, h('option', { value: '' }, 'Todas'), sucursales.map((s) => h('option', { value: s.id }, s.nombre))) : null;
    const cuerpo = h('div', { class: 'stack' }); let filas = [], ctx = null;
    const cabecera = h('div', { class: 'page-head' },
      h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
      h('div', { class: 'grow' }, h('div', { class: 'small muted' }, libro.nombre), h('h1', {}, m.nombre), h('p', { class: 'muted' }, m.ayuda || ''),
        h('div', { class: 'meta' }, h('span', {}, h('b', {}, 'Captura: '), rolesTxt(m.cap)), h('span', {}, h('b', {}, 'Revisa: '), rolesTxt(m.rev)), m.frecuencia ? h('span', {}, h('b', {}, 'Frecuencia: '), m.frecuencia) : null)),
      puede(m.clave, 'capturar') ? h('button', { class: 'btn primary', type: 'button', onclick: () => editar(null) }, unico ? 'Actualizar valores' : '+ Nuevo registro') : null);
    const filtros = unico ? null : h('div', { class: 'card filters' }, h('label', { class: 'field' }, 'Desde', desde), h('label', { class: 'field' }, 'Hasta', hasta), h('label', { class: 'field' }, 'Estado', fEstado),
      fSuc ? h('label', { class: 'field' }, 'Sucursal', fSuc) : null, h('button', { class: 'btn', type: 'button', onclick: () => cargar() }, 'Aplicar'),
      h('button', { class: 'btn', type: 'button', onclick: () => exportar() }, 'Exportar CSV'));
    view.replaceChildren(cabecera, filtros, cuerpo);
    const camposTabla = m.campos.filter((c) => c.t !== 'seccion' && c.t !== 'nota');
    const calcRev = (m.revision || []);

    function exportar() {
      const cols = ['Fecha', 'Sucursal'].concat(m.campos.filter((c) => c.t !== 'seccion').map((c) => c.l), calcRev.map((c) => 'Revisión · ' + c.l), ['Estado', 'Capturó', 'Capturado', 'Revisó', 'Revisado', 'Motivo de anulación']);
      const suc = (id) => (sucursales.find((s) => s.id === id) || {}).nombre || '';
      const val = (c, r, src) => (c.t === 'calc' ? valorCalc(c, r, ctx) : c.t === 'lineas' ? JSON.stringify(src[c.k] || []) : src[c.k]);
      csv(m.clave, cols, visibles().map((r) => [r.fecha, suc(r.sucursal_id)].concat(m.campos.filter((c) => c.t !== 'seccion').map((c) => val(c, r, r.datos || {})), calcRev.map((c) => val(c, r, r.revision || {})),
        [r.estado, nombreDe(r.creado_por), r.creado_en, r.revisado_por ? nombreDe(r.revisado_por) : '', r.revisado_en || '', r.motivo_anulacion || ''])));
    }
    const visibles = () => filas.filter((r) => !fEstado.value || r.estado === fEstado.value);

    async function cargar() {
      cuerpo.replaceChildren(h('p', { class: 'muted' }, 'Cargando…'));
      invalidar(m.clave); ctx = await contexto(m);
      filas = unico ? await leer(m.clave) : await leer(m.clave, { desde: desde.value, hasta: hasta.value, sucursal: fSuc && fSuc.value });
      ctx.filas = filas.filter((r) => r.estado !== 'anulado');
      if (unico) return pintarUnico();
      const v = visibles();
      if (!v.length) { cuerpo.replaceChildren(h('div', { class: 'card muted' }, filas.length ? 'No hay registros con ese filtro.' : 'Aún no hay registros en este formato para el periodo seleccionado.')); return; }
      const esChk = m.tipo === 'checklist';
      const cab = ['Fecha'].concat(camposTabla.map((c) => c.l), esChk ? ['OK', 'Fallas'] : [], calcRev.map((c) => c.l), ['Estado', 'Capturó']);
      cuerpo.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, cab.map((t) => h('th', {}, t)))),
        h('tbody', {}, v.map((r) => h('tr', { class: 'click' + (r.estado === 'anulado' ? ' anulado' : ''), tabindex: 0, onclick: () => detalle(r), onkeydown: (e) => { if (e.key === 'Enter') detalle(r); } },
          h('td', { class: 'nowrap' }, fFecha(r.fecha)), camposTabla.map((c) => celda(c, r, ctx)),
          esChk ? [h('td', { class: 'num' }, Object.values(r.datos.items || {}).filter((x) => x.e === 'OK').length), h('td', { class: 'num' + (Object.values(r.datos.items || {}).some((x) => x.e === 'Falla') ? ' neg' : '') }, Object.values(r.datos.items || {}).filter((x) => x.e === 'Falla').length)] : null,
          calcRev.map((c) => (c.t === 'calc' ? celda(c, r, ctx) : celda(c, { datos: r.revision || {} }, ctx))),
          h('td', {}, badgeEstado(r)), h('td', { class: 'txt' }, nombreDe(r.creado_por))))))),
        h('p', { class: 'small muted' }, v.length + ' registro(s). Haz clic en un renglón para ver el detalle, corregir, revisar o anular.')));
    }
    function pintarUnico() {
      const vig = filas.filter((r) => r.estado !== 'anulado'); const act = vig[0];
      if (!act) { cuerpo.replaceChildren(h('div', { class: 'card muted' }, 'Aún no se han capturado valores. ' + (puede(m.clave, 'capturar') ? 'Usa "Actualizar valores" para definirlos.' : 'Los define: ' + rolesTxt(m.cap) + '.'))); return; }
      cuerpo.replaceChildren(h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Valores vigentes'), badgeEstado(act),
          h('button', { class: 'btn sm', type: 'button', onclick: () => detalle(act) }, 'Ver / revisar')),
        fichaDatos(m.campos, act, ctx), h('p', { class: 'small muted' }, 'Vigente desde ' + fFecha(act.creado_en, true) + ' · capturó ' + nombreDe(act.creado_por))),
        h('div', { class: 'card' }, h('h3', {}, 'Historial de versiones'), h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Capturado', 'Capturó', 'Estado', 'Revisó'].map((t) => h('th', {}, t)))),
          h('tbody', {}, filas.map((r) => h('tr', { class: 'click' + (r.estado === 'anulado' ? ' anulado' : ''), onclick: () => detalle(r) }, h('td', {}, fFecha(r.creado_en, true)), h('td', {}, nombreDe(r.creado_por)), h('td', {}, badgeEstado(r)), h('td', {}, r.revisado_por ? nombreDe(r.revisado_por) : '—'))))))));
    }
    function fichaDatos(campos, r, c, origen) {
      const src = origen || r.datos || {};
      return h('dl', { class: 'dl' }, campos.map((cm) => {
        if (cm.t === 'seccion') return [h('dt', { class: 'seccion' }, cm.l), h('dd', {})];
        let v; if (cm.t === 'calc') v = fmt(valorCalc(cm, r, c), cm.fmt);
        else if (cm.t === 'lineas') v = (src[cm.k] || []).map((ln) => cm.sub.map((s) => s.l + ': ' + (ln[s.k] === undefined ? '—' : ln[s.k])).join(' · ')).join('\n') || '—';
        else if (cm.t === 'dinero') v = fmt(n(src[cm.k]), 'dinero'); else if (cm.t === 'pct') v = fmt(n(src[cm.k]), 'pct'); else if (cm.t === 'fecha') v = src[cm.k] ? fFecha(src[cm.k]) : '—';
        else v = src[cm.k] === undefined || src[cm.k] === null ? '—' : String(src[cm.k]);
        return [h('dt', {}, cm.l), h('dd', {}, v)];
      }));
    }
    function detalle(r) {
      const mio = r.creado_por === sesion.user.id; const acciones = [];
      const cuerpoD = [h('div', { class: 'row' }, badgeEstado(r), h('span', { class: 'muted small' }, 'Fecha: ' + fFecha(r.fecha) + ' · Capturó ' + nombreDe(r.creado_por) + ' el ' + fFecha(r.creado_en, true))),
        fichaDatos(m.campos, r, ctx)];
      if (m.tipo === 'checklist') cuerpoD.push(h('div', { class: 'chk' }, m.items.map((t, i) => { const it = (r.datos.items || {})[i + 1] || {};
        return h('div', { class: 'it' }, h('span', {}, (i + 1) + '. ' + t), h('span', { class: 'badge ' + (it.e === 'OK' ? 'ok' : it.e === 'Falla' ? 'bad' : '') }, it.e || '—'), h('span', { class: 'small' }, it.o || '')); })));
      if (r.estado === 'revisado') cuerpoD.push(h('div', { class: 'notice' }, h('b', {}, 'Revisado por ' + nombreDe(r.revisado_por) + ' el ' + fFecha(r.revisado_en, true)),
        calcRev.length ? fichaDatos(calcRev, r, ctx, r.revision || {}) : null));
      if (r.estado === 'anulado') cuerpoD.push(h('div', { class: 'notice' }, h('b', {}, 'Anulado por ' + nombreDe(r.anulado_por) + ' el ' + fFecha(r.anulado_en, true)), h('p', {}, 'Motivo: ' + (r.motivo_anulacion || '—'))));
      let d;
      if (r.estado === 'capturado' && mio && puede(m.clave, 'capturar')) acciones.push(h('button', { class: 'btn', type: 'button', onclick: () => { d.close(); editar(r); } }, 'Corregir'));
      if (r.estado === 'capturado' && puede(m.clave, 'revisar')) {
        if (mio) cuerpoD.push(h('p', { class: 'small muted' }, 'Segregación de funciones: tú capturaste este registro, por lo que debe revisarlo otra persona (' + rolesTxt(m.rev) + ').'));
        else acciones.push(h('button', { class: 'btn primary', type: 'button', onclick: () => { d.close(); revisar(r); } }, 'Revisar'));
      }
      if (r.estado !== 'anulado' && puede(m.clave, 'anular')) acciones.push(h('button', { class: 'btn danger', type: 'button', onclick: () => { d.close(); anular(r); } }, 'Anular'));
      d = dialogo(m.nombre, cuerpoD, acciones);
    }
    function editar(r) {
      const base = r ? r.datos : (unico && filas.find((x) => x.estado !== 'anulado') ? filas.find((x) => x.estado !== 'anulado').datos : {});
      const fecha = h('input', { type: 'date', value: r ? r.fecha : hoy(), required: true, max: masDias(hoy(), 1) });
      const suc = sucursales.length ? h('select', {}, h('option', { value: '' }, '—'), sucursales.map((s) => h('option', { value: s.id }, s.nombre))) : null;
      if (suc) suc.value = (r ? r.sucursal_id : perfil.sucursal_id) || '';
      const ctxCalc = (c, d) => c.calc(d, ctx, {}, { fecha: fecha.value, datos: d }); ctxCalc.ctx = ctx;
      const f = formulario(m.campos, base, ctxCalc); const chk = m.tipo === 'checklist' ? editorChecklist(m, base) : null;
      const btn = h('button', { class: 'btn primary', type: 'submit' }, r ? 'Guardar corrección' : 'Guardar');
      const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); if (!f.validar() || (chk && !chk.validar())) return;
        const datos = f.leer(); if (chk) datos.items = chk.leer(); btn.disabled = true;
        try {
          if (r) await run(db.rpc('registro_actualizar', { p_id: r.id, p_datos: datos, p_fecha: fecha.value, p_sucursal: (suc && suc.value) || null }), 'Corrección guardada');
          else await run(db.from('registros').insert({ modulo: m.clave, fecha: fecha.value, sucursal_id: (suc && suc.value) || null, datos }), unico ? 'Valores actualizados' : 'Registro guardado');
          d.close(); cargar(); refrescarPendientes();
        } catch (err) { btn.disabled = false; } } },
        h('div', { class: 'form-grid' }, h('label', { class: 'field' }, unico ? 'Vigente a partir de *' : 'Fecha *', fecha), suc ? h('label', { class: 'field' }, 'Sucursal', suc) : null),
        f.nodo, chk ? chk.nodo : null, h('div', { class: 'row' }, h('span', { class: 'grow small muted' }, '* obligatorio · Quedará a tu nombre y pasará a revisión de: ' + rolesTxt(m.rev)), btn));
      const d = dialogo((r ? 'Corregir · ' : unico ? 'Actualizar · ' : 'Nuevo · ') + m.nombre, form);
    }
    function revisar(r) {
      const ctxCalc = (c, rv) => c.calc(r.datos || {}, ctx, rv, r); ctxCalc.ctx = ctx;
      const f = calcRev.length ? formulario(calcRev, {}, ctxCalc) : null; const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Confirmar revisión');
      const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); if (f && !f.validar()) return; btn.disabled = true;
        try { await run(db.rpc('registro_revisar', { p_id: r.id, p_revision: f ? f.leer() : {} }), 'Registro revisado'); d.close(); cargar(); refrescarPendientes(); } catch (err) { btn.disabled = false; } } },
        h('p', {}, 'Al confirmar, el registro queda cerrado a tu nombre y ya no podrá corregirse. Si tiene un error, anúlalo o pide que lo corrijan antes de revisar.'),
        fichaDatos(m.campos, r, ctx), f ? [h('div', { class: 'seccion' }, 'Datos de quien revisa'), f.nodo] : null, h('div', { class: 'row' }, h('span', { class: 'grow' }), btn));
      const d = dialogo('Revisar · ' + m.nombre, form);
    }
    function anular(r) {
      const motivo = h('textarea', { required: true, minlength: 5, maxlength: 500 }); const btn = h('button', { class: 'btn danger', type: 'submit' }, 'Anular registro');
      const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); btn.disabled = true;
        try { await run(db.rpc('registro_anular', { p_id: r.id, p_motivo: motivo.value }), 'Registro anulado'); d.close(); cargar(); refrescarPendientes(); } catch (err) { btn.disabled = false; } } },
        h('p', {}, 'El registro no se borra: queda marcado como anulado, con tu nombre, la fecha y el motivo. Esta acción no se puede deshacer.'), h('label', { class: 'field' }, 'Motivo de la anulación *', motivo),
        h('div', { class: 'row' }, h('span', { class: 'grow' }), btn));
      const d = dialogo('Anular · ' + m.nombre, form);
    }
    await cargar();
  }

  // ---------------------------------------------------------------- vistas calculadas
  function pintarBloques(res) {
    const out = [];
    (res.avisos || []).forEach((a) => out.push(h('div', { class: 'notice' }, a)));
    (res.bloques || []).forEach((b) => {
      if (b.kpis) out.push(h('div', { class: 'stack' }, h('h2', {}, b.titulo), h('div', { class: 'kpis' }, b.kpis.map((k) => h('div', { class: 'kpi' }, h('span', {}, k.l), h('b', {}, fmt(k.v, k.f)))))));
      if (b.tabla) { const t = b.tabla;
        out.push(h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, b.titulo),
            h('button', { class: 'btn sm', type: 'button', onclick: () => csv(b.titulo.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40), t.cols, t.filas.map((f) => f.map((v) => (v && typeof v === 'object' ? v.v : v)))) }, 'Exportar CSV')),
          h('div', { class: 'table-wrap sticky-first' }, h('table', {}, h('thead', {}, h('tr', {}, t.cols.map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
            h('tbody', {}, t.filas.map((f) => h('tr', {}, f.map((v, i) => { const val = v && typeof v === 'object' ? v.v : v;
              return h('td', { class: (i ? 'num' : '') + (typeof val === 'number' && val < 0 ? ' neg' : '') }, fmt(v, t.fmts[i])); }))))))));
      }
    });
    return out;
  }
  async function paginaVista(v) {
    const view = $('view'); const libro = LIBROS.find((l) => l.clave === v.libro);
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
      h('div', { class: 'grow' }, h('div', { class: 'small muted' }, libro.nombre + ' · vista calculada'), h('h1', {}, v.nombre)),
      h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Imprimir / PDF')), h('p', { class: 'muted' }, 'Calculando…'));
    const src = {}; for (const k of v.fuentes) { filasCache.delete(k); src[k] = await leerTodo(k); }
    const extra = {};
    if (v.clave === 'v_inv_conciliacion' && puede('f2_insumos', 'ver')) { const precios = new Map();
      window.LDCalc.vivos(await leerTodo('f2_insumos')).slice().reverse().forEach((r) => precios.set(String(r.datos.insumo || '').trim().toLowerCase(), n(r.datos.precio)));
      extra.costos = { insumosCompra: precios }; }
    let res; try { res = window.LDCalc.VISTAS[v.clave](src, extra); } catch (e) { res = { avisos: ['No fue posible calcular la vista: ' + e.message], bloques: [] }; }
    view.lastChild.remove(); view.append(...pintarBloques(res));
  }

  // ---------------------------------------------------------------- inicio y pendientes de revisión
  let pendientes = new Map();
  async function refrescarPendientes() {
    const mods = MODULOS.filter((m) => puede(m.clave, 'revisar')).map((m) => m.clave); pendientes = new Map();
    if (mods.length) { const { data } = await db.from('registros').select('modulo, creado_por').eq('estado', 'capturado').in('modulo', mods).neq('creado_por', sesion.user.id).limit(5000);
      (data || []).forEach((r) => pendientes.set(r.modulo, (pendientes.get(r.modulo) || 0) + 1)); }
    document.querySelectorAll('#nav [data-mod]').forEach((a) => { const c = pendientes.get(a.dataset.mod); const p = a.querySelector('.pill'); if (p) p.remove(); if (c) a.append(h('span', { class: 'pill' }, c)); });
    const tot = Array.from(pendientes.values()).reduce((a, b) => a + b, 0); const ini = document.querySelector('#nav [data-ruta="revision"]');
    if (ini) { const p = ini.querySelector('.pill'); if (p) p.remove(); if (tot) ini.append(h('span', { class: 'pill' }, tot)); }
  }
  async function paginaInicio() {
    const view = $('view'); const captura = MODULOS.filter((m) => puede(m.clave, 'capturar') && m.tipo !== 'unico' && m.cap.some((x) => rolesDe(perfil).includes(x)));
    const { data: mios } = await db.from('registros').select('id, modulo, fecha, estado, creado_en').eq('creado_por', sesion.user.id).order('creado_en', { ascending: false }).limit(12);
    await refrescarPendientes(); const tot = Array.from(pendientes.values()).reduce((a, b) => a + b, 0);
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
        h('div', { class: 'grow' }, h('h1', {}, 'Hola, ' + (perfil.nombre || perfil.email)), h('p', { class: 'muted' }, rolesNombre(perfil) + ' · ' + fFecha(hoy())))),
      h('div', { class: 'kpis' }, h('div', { class: 'kpi' }, h('span', {}, 'Registros por revisar (tuyos como revisor)'), h('b', {}, tot)),
        h('div', { class: 'kpi' }, h('span', {}, 'Formatos que capturas'), h('b', {}, captura.length)), h('div', { class: 'kpi' }, h('span', {}, 'Tus capturas pendientes de revisión'), h('b', {}, (mios || []).filter((r) => r.estado === 'capturado').length))),
      captura.length ? h('div', { class: 'card stack' }, h('h2', {}, 'Tus formatos de captura'), h('div', { class: 'row' }, captura.map((m) => h('a', { class: 'btn sm', href: '#/m/' + m.clave }, m.nombre)))) : null,
      h('div', { class: 'card stack' }, h('h2', {}, 'Tus últimas capturas'), (mios || []).length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Formato', 'Fecha', 'Estado', 'Capturado'].map((t) => h('th', {}, t)))),
        h('tbody', {}, mios.map((r) => h('tr', { class: 'click', onclick: () => { location.hash = '#/m/' + r.modulo; } }, h('td', {}, (MOD.get(r.modulo) || {}).nombre || r.modulo), h('td', {}, fFecha(r.fecha)), h('td', {}, badgeEstado(r)), h('td', {}, fFecha(r.creado_en, true))))))) : h('p', { class: 'muted' }, 'Aún no has capturado registros.')));
  }
  async function paginaRevision() {
    await refrescarPendientes(); const view = $('view'); const lista = MODULOS.filter((m) => pendientes.get(m.clave));
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
        h('div', { class: 'grow' }, h('h1', {}, 'Pendientes de revisión'), h('p', { class: 'muted' }, 'Registros capturados por otras personas que te corresponde revisar.'))),
      lista.length ? h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Libro', 'Formato', 'Por revisar'].map((t) => h('th', {}, t)))),
        h('tbody', {}, lista.map((m) => h('tr', { class: 'click', onclick: () => { location.hash = '#/m/' + m.clave; } }, h('td', {}, LIBROS.find((l) => l.clave === m.libro).nombre), h('td', {}, m.nombre), h('td', { class: 'num' }, pendientes.get(m.clave)))))))) : h('div', { class: 'card muted' }, 'No tienes registros pendientes de revisar.'));
  }

  // ---------------------------------------------------------------- administración: usuarios, permisos, sucursales, auditoría
  async function funcionAdmin(cuerpo) {
    const { data, error } = await db.functions.invoke('admin-usuarios', { body: cuerpo });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) { /* sin detalle */ } toast(m, 'bad'); throw error; }
    if (data && data.error) { toast(data.error, 'bad'); throw new Error(data.error); } return data;
  }
  const rolesAsignables = () => Object.keys(ROLES).filter((r) => esRol('super_admin') || !['super_admin', 'direccion', 'administrador'].includes(r));
  async function paginaUsuarios() {
    const view = $('view'); const usuarios = await run(db.from('profiles').select('*').order('nombre'));
    const formUsuario = (u) => {
      const email = h('input', { type: 'email', required: true, value: u ? u.email : '', disabled: !!u }), nombre = h('input', { type: 'text', required: true, maxlength: 120, value: u ? u.nombre : '' });
      const rol = h('select', { required: true }, h('option', { value: '' }, '—'), rolesAsignables().map((r) => h('option', { value: r }, ROLES[r]))); if (u && u.rol) rol.value = u.rol;
      const suc = h('select', {}, h('option', { value: '' }, '—'), sucursales.map((s) => h('option', { value: s.id }, s.nombre))); if (u && u.sucursal_id) suc.value = u.sucursal_id;
      const extras = rolesAsignables().map((r) => ({ r, cb: h('input', { type: 'checkbox', checked: !!(u && (u.roles_extra || []).includes(r)) }) }));
      const leerExtras = () => extras.filter((x) => x.cb.checked && x.r !== rol.value).map((x) => x.r);
      const activo = h('input', { type: 'checkbox', checked: u ? u.activo : true }); const pass = h('input', { type: 'password', minlength: 10, maxlength: 72, required: !u, autocomplete: 'new-password' });
      const btn = h('button', { class: 'btn primary', type: 'submit' }, u ? 'Guardar' : 'Crear usuario');
      const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); btn.disabled = true;
        try {
          if (u) await run(db.rpc('usuario_configurar', { p_id: u.id, p_nombre: nombre.value, p_rol: rol.value, p_activo: activo.checked, p_sucursal: suc.value || null, p_forzar_cambio: false, p_roles_extra: leerExtras() }), 'Usuario actualizado');
          else { await funcionAdmin({ accion: 'crear', email: email.value.trim(), password: pass.value, nombre: nombre.value, rol: rol.value, roles_extra: leerExtras(), sucursal: suc.value || null }); toast('Usuario creado', 'ok'); }
          d.close(); paginaUsuarios();
        } catch (err) { btn.disabled = false; } } },
        h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Correo *', email), h('label', { class: 'field' }, 'Nombre *', nombre), h('label', { class: 'field' }, 'Rol principal *', rol), h('label', { class: 'field' }, 'Sucursal', suc),
          u ? null : h('label', { class: 'field' }, 'Contraseña temporal * (mín. 10)', pass)),
        h('div', { class: 'seccion' }, 'Roles adicionales (opcional)'), h('div', { class: 'roles-extra' }, extras.map((x) => h('label', { class: 'check' }, x.cb, ROLES[x.r]))),
        h('p', { class: 'small muted' }, 'La persona tendrá los permisos de todos sus roles. Úsalo solo cuando realmente cubra más de un puesto: cada rol adicional reduce la separación de funciones. La regla de que nadie revisa lo que él mismo capturó se mantiene.'),
        h('label', { class: 'check' }, activo, 'Usuario activo'),
        u ? null : h('p', { class: 'small muted' }, 'La contraseña es temporal: el sistema obligará a la persona a cambiarla en su primer acceso. Entrégala en persona, no por chat.'),
        h('div', { class: 'row' }, h('span', { class: 'grow' }), btn));
      const d = dialogo(u ? 'Editar usuario' : 'Nuevo usuario', form);
    };
    const reset = (u) => { const pass = h('input', { type: 'password', minlength: 10, maxlength: 72, required: true, autocomplete: 'new-password' }); const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Restablecer');
      const d = dialogo('Restablecer contraseña · ' + (u.nombre || u.email), h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); btn.disabled = true;
        try { await funcionAdmin({ accion: 'reset', id: u.id, password: pass.value }); toast('Contraseña restablecida; deberá cambiarla al entrar', 'ok'); d.close(); paginaUsuarios(); } catch (err) { btn.disabled = false; } } },
        h('label', { class: 'field' }, 'Nueva contraseña temporal * (mín. 10)', pass), h('div', { class: 'row' }, h('span', { class: 'grow' }), btn))); };
    const gestionable = (u) => u.id !== sesion.user.id && (esRol('super_admin') || !rolesDe(u).some((x) => ['super_admin', 'direccion', 'administrador'].includes(x)));
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
        h('div', { class: 'grow' }, h('h1', {}, 'Usuarios'), h('p', { class: 'muted' }, 'El super administrador gestiona a todos; el administrador solo a los roles operativos. Una persona puede tener un rol principal y roles adicionales. Nadie cambia sus propios roles.')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => formUsuario(null) }, '+ Nuevo usuario')),
      h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nombre', 'Correo', 'Rol', 'Sucursal', 'Estado', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, usuarios.map((u) => h('tr', {}, h('td', {}, u.nombre || '—'), h('td', {}, u.email), h('td', {}, u.rol ? rolesNombre(u) : h('span', { class: 'badge warn' }, 'Sin rol')),
          h('td', {}, (sucursales.find((s) => s.id === u.sucursal_id) || {}).nombre || '—'),
          h('td', {}, h('span', { class: 'badge ' + (u.activo ? 'ok' : 'bad') }, u.activo ? 'Activo' : 'Inactivo'), u.debe_cambiar_password && u.activo ? h('span', { class: 'badge warn' }, 'Debe cambiar contraseña') : null),
          h('td', { class: 'right nowrap' }, gestionable(u) ? [h('button', { class: 'btn sm', type: 'button', onclick: () => formUsuario(u) }, 'Editar'), ' ', h('button', { class: 'btn sm', type: 'button', onclick: () => reset(u) }, 'Restablecer contraseña')] : null))))))));
  }
  async function paginaPermisos() {
    const view = $('view'); const perms = await run(db.from('permisos').select('*')); const mapa = new Map(perms.map((p) => [p.modulo + '|' + p.rol, p]));
    const editable = esRol('super_admin'); const roles = Object.keys(ROLES);
    const celdaP = (m, rol) => { const p = mapa.get(m.clave + '|' + rol) || { ver: false, capturar: false, revisar: false, anular: false };
      const txt = () => ['ver', 'capturar', 'revisar', 'anular'].filter((a) => p[a]).map((a) => a[0].toUpperCase()).join(' ') || '·';
      const td = h('td', { title: ROLES[rol] + ' · ' + m.nombre }, txt());
      if (editable && rol !== 'super_admin') { td.style.cursor = 'pointer'; td.addEventListener('click', () => { const cb = {}; ['ver', 'capturar', 'revisar', 'anular'].forEach((a) => { cb[a] = h('input', { type: 'checkbox', checked: p[a] }); });
        const d = dialogo(ROLES[rol] + ' · ' + m.nombre, [h('div', { class: 'stack' }, ['ver', 'capturar', 'revisar', 'anular'].map((a) => h('label', { class: 'check' }, cb[a], a[0].toUpperCase() + a.slice(1)))),
          h('p', { class: 'small muted' }, 'Evita dar "capturar" y "revisar" al mismo rol cuando solo haya una persona con ese rol. La base impide, de todos modos, que alguien revise su propio registro.')],
          [h('button', { class: 'btn primary', type: 'button', onclick: async () => { await run(db.rpc('permiso_configurar', { p_modulo: m.clave, p_rol: rol, p_ver: cb.ver.checked, p_capturar: cb.capturar.checked, p_revisar: cb.revisar.checked, p_anular: cb.anular.checked }), 'Permiso actualizado'); d.close(); paginaPermisos(); } }, 'Guardar')]); }); }
      return td; };
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
        h('div', { class: 'grow' }, h('h1', {}, 'Roles y permisos'), h('p', { class: 'muted' }, 'V = ver · C = capturar · R = revisar · A = anular.' + (editable ? ' Haz clic en una celda para cambiarla; cada cambio queda en la bitácora.' : ' Solo el super administrador puede modificarlos.')))),
      LIBROS.map((l) => h('div', { class: 'card stack' }, h('h2', {}, l.nombre), h('div', { class: 'table-wrap sticky-first' }, h('table', { class: 'perm' }, h('thead', {}, h('tr', {}, h('th', {}, 'Formato'), roles.map((r) => h('th', { title: ROLES[r] }, ROLES[r].split(' ').map((w) => w.slice(0, 4)).join(' '))))),
        h('tbody', {}, MODULOS.filter((m) => m.libro === l.clave).map((m) => h('tr', {}, h('td', {}, m.nombre), roles.map((r) => celdaP(m, r))))))))));
  }
  async function paginaSucursales() {
    const view = $('view'); sucursales = await run(db.from('sucursales').select('*').order('nombre'));
    const nombre = h('input', { type: 'text', required: true, minlength: 2, maxlength: 80, placeholder: 'Nombre de la sucursal' });
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
        h('div', { class: 'grow' }, h('h1', {}, 'Sucursales'), h('p', { class: 'muted' }, 'Los registros pueden asociarse a una sucursal. Las sucursales no se borran: se desactivan.'))),
      h('form', { class: 'card filters', onsubmit: async (e) => { e.preventDefault(); await run(db.from('sucursales').insert({ nombre: nombre.value.trim() }), 'Sucursal creada'); paginaSucursales(); } }, h('label', { class: 'field grow' }, 'Nueva sucursal', nombre), h('button', { class: 'btn primary', type: 'submit' }, 'Agregar')),
      h('div', { class: 'card' }, sucursales.length ? h('table', {}, h('tbody', {}, sucursales.map((s) => h('tr', {}, h('td', {}, s.nombre), h('td', {}, h('span', { class: 'badge ' + (s.activa ? 'ok' : 'bad') }, s.activa ? 'Activa' : 'Inactiva')),
        h('td', { class: 'right' }, h('button', { class: 'btn sm', type: 'button', onclick: async () => { await run(db.from('sucursales').update({ activa: !s.activa }).eq('id', s.id), 'Actualizada'); paginaSucursales(); } }, s.activa ? 'Desactivar' : 'Activar')))))) : h('p', { class: 'muted' }, 'Aún no hay sucursales.')));
  }
  async function paginaAuditoria() {
    const view = $('view'); const desde = h('input', { type: 'date', value: masDias(hoy(), -7) }), hasta = h('input', { type: 'date', value: hoy() });
    const fMod = h('select', {}, h('option', { value: '' }, 'Todos'), MODULOS.map((m) => h('option', { value: m.clave }, m.nombre + ' (' + m.libro.toUpperCase() + ')'))); const cuerpo = h('div', {});
    const cargar = async () => { let q = db.from('audit_logs').select('*').gte('ts', desde.value + 'T00:00:00').lte('ts', hasta.value + 'T23:59:59').order('ts', { ascending: false }).limit(500); if (fMod.value) q = q.eq('modulo', fMod.value);
      const f = await run(q); cuerpo.replaceChildren(f.length ? h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Fecha y hora', 'Usuario', 'Rol', 'Acción', 'Tabla', 'Formato'].map((t) => h('th', {}, t)))),
        h('tbody', {}, f.map((r) => h('tr', { class: 'click', onclick: () => dialogo('Detalle de bitácora', [h('h3', {}, 'Antes'), h('pre', { class: 'json' }, JSON.stringify(r.antes, null, 2) || '—'), h('h3', {}, 'Después'), h('pre', { class: 'json' }, JSON.stringify(r.despues, null, 2) || '—')]) },
          h('td', { class: 'nowrap' }, fFecha(r.ts, true)), h('td', {}, r.usuario ? nombreDe(r.usuario) : 'Sistema'), h('td', {}, ROLES[r.rol] || r.rol || '—'), h('td', {}, r.accion), h('td', {}, r.tabla), h('td', {}, (MOD.get(r.modulo) || {}).nombre || r.modulo || '—')))))), h('p', { class: 'small muted' }, 'Se muestran hasta 500 movimientos. La bitácora no puede editarse ni borrarse.')) : h('div', { class: 'card muted' }, 'Sin movimientos en el periodo.')); };
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'), h('div', { class: 'grow' }, h('h1', {}, 'Bitácora de auditoría'), h('p', { class: 'muted' }, 'Quién hizo qué y cuándo: capturas, correcciones, revisiones, anulaciones, usuarios y permisos.'))),
      h('div', { class: 'card filters' }, h('label', { class: 'field' }, 'Desde', desde), h('label', { class: 'field' }, 'Hasta', hasta), h('label', { class: 'field' }, 'Formato', fMod), h('button', { class: 'btn', type: 'button', onclick: cargar }, 'Aplicar')), cuerpo);
    await cargar();
  }

  // ---------------------------------------------------------------- marca (logotipo)
  // El logotipo vive en un bucket público de solo imágenes; lo sube únicamente el super administrador.
  const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp'], LOGO_MAX = 1048576;
  const logoUrl = () => { let v = ''; try { v = localStorage.getItem('ld_logo_v') || ''; } catch (e) { /* sin almacenamiento */ }
    return cfg.supabaseUrl + '/storage/v1/object/public/marca/logo?v=' + (v || Math.floor(Date.now() / 3600000)); };
  function cargarLogo() {
    document.querySelectorAll('img[data-logo]').forEach((img) => { const txt = img.parentElement.querySelector('[data-marca]');
      img.onload = () => { img.classList.remove('hidden'); if (txt) txt.classList.add('hidden'); };
      img.onerror = () => { img.classList.add('hidden'); if (txt) txt.classList.remove('hidden'); };
      img.src = logoUrl(); });
  }
  const marcarLogo = () => { try { localStorage.setItem('ld_logo_v', String(Date.now())); } catch (e) { /* sin almacenamiento */ } cargarLogo(); };
  async function paginaMarca() {
    const view = $('view'); const archivo = h('input', { type: 'file', accept: LOGO_TIPOS.join(','), required: true });
    const vista = h('img', { class: 'logo-prev', alt: 'Logotipo actual' }); const sin = h('p', { class: 'muted' }, 'Aún no hay logotipo: se muestra el nombre en texto.');
    vista.onload = () => { vista.classList.remove('hidden'); sin.classList.add('hidden'); }; vista.onerror = () => { vista.classList.add('hidden'); sin.classList.remove('hidden'); };
    const refrescar = () => { vista.src = logoUrl(); }; const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Subir logotipo');
    view.replaceChildren(h('div', { class: 'page-head' }, h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
        h('div', { class: 'grow' }, h('h1', {}, 'Marca'), h('p', { class: 'muted' }, 'El logotipo aparece en la pantalla de acceso y en el menú. Lo cambia solo el super administrador.'))),
      h('div', { class: 'card stack' }, h('h2', {}, 'Logotipo actual'), h('div', { class: 'logo-marco' }, vista, sin),
        h('div', { class: 'row' }, h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (!confirm('¿Quitar el logotipo? Se mostrará el nombre en texto.')) return;
          await run(db.storage.from('marca').remove(['logo']), 'Logotipo eliminado'); marcarLogo(); refrescar(); } }, 'Quitar logotipo'))),
      h('form', { class: 'card stack', onsubmit: async (e) => { e.preventDefault(); const f = archivo.files[0]; if (!f) return;
          if (!LOGO_TIPOS.includes(f.type)) return toast('Formato no permitido. Usa PNG, JPG o WebP.', 'bad');
          if (f.size > LOGO_MAX) return toast('El archivo pesa más de 1 MB. Reduce su tamaño.', 'bad');
          btn.disabled = true;
          try { await run(db.storage.from('marca').upload('logo', f, { upsert: true, contentType: f.type, cacheControl: '300' }), 'Logotipo actualizado'); archivo.value = ''; marcarLogo(); refrescar(); }
          finally { btn.disabled = false; } } },
        h('h2', {}, 'Subir o reemplazar'), h('label', { class: 'field' }, 'Archivo (PNG, JPG o WebP · máximo 1 MB)', archivo),
        h('p', { class: 'small muted' }, 'Recomendado: PNG con fondo transparente, horizontal, de al menos 600 px de ancho. No se aceptan SVG por seguridad. Los demás usuarios verán el cambio en unos minutos.'),
        h('div', { class: 'row' }, h('span', { class: 'grow' }), btn)));
    refrescar();
  }

  // ---------------------------------------------------------------- navegación
  const vistaVisible = (v) => v.ver.some((x) => rolesDe(perfil).includes(x)) && v.fuentes.every((f) => puede(f, 'ver'));
  function construirNav() {
    const nav = $('nav'); const item = (ruta, txt, extra) => h('a', Object.assign({ href: '#/' + ruta, 'data-ruta': ruta }, extra || {}), txt);
    const kids = [item('inicio', 'Inicio'), MODULOS.some((m) => puede(m.clave, 'revisar')) ? item('revision', 'Pendientes de revisión') : null];
    LIBROS.forEach((l) => { const mods = MODULOS.filter((m) => m.libro === l.clave && puede(m.clave, 'ver')); const vis = VISTAS.filter((v) => v.libro === l.clave && vistaVisible(v));
      if (!mods.length && !vis.length) return;
      kids.push(h('details', {}, h('summary', {}, l.nombre), vis.map((v) => item('v/' + v.clave, '◆ ' + v.nombre)), mods.map((m) => item('m/' + m.clave, m.nombre, { 'data-mod': m.clave })))); });
    const adm = [esRol('super_admin', 'administrador') ? item('usuarios', 'Usuarios') : null, esRol('super_admin', 'direccion', 'administrador') ? item('permisos', 'Roles y permisos') : null,
      esRol('super_admin', 'administrador') ? item('sucursales', 'Sucursales') : null, esRol('super_admin', 'direccion') ? item('auditoria', 'Bitácora de auditoría') : null, esRol('super_admin') ? item('marca', 'Marca') : null].filter(Boolean);
    if (adm.length) kids.push(h('details', { open: true }, h('summary', {}, 'Administración'), adm));
    nav.replaceChildren(kids);
  }
  async function ruta() {
    if (!perfil) return; const r = (location.hash || '#/inicio').slice(2); $('sidebar').classList.remove('open');
    document.querySelectorAll('#nav a').forEach((a) => { const on = a.dataset.ruta === r; a.classList.toggle('on', on); if (on && a.parentElement.tagName === 'DETAILS') a.parentElement.open = true; });
    try {
      if (r.startsWith('m/')) { const m = MOD.get(r.slice(2)); if (m && puede(m.clave, 'ver')) return await paginaModulo(m); }
      else if (r.startsWith('v/')) { const v = VISTAS.find((x) => x.clave === r.slice(2)); if (v && vistaVisible(v)) return await paginaVista(v); }
      else if (r === 'revision') return await paginaRevision();
      else if (r === 'usuarios' && esRol('super_admin', 'administrador')) return await paginaUsuarios();
      else if (r === 'permisos' && esRol('super_admin', 'direccion', 'administrador')) return await paginaPermisos();
      else if (r === 'sucursales' && esRol('super_admin', 'administrador')) return await paginaSucursales();
      else if (r === 'auditoria' && esRol('super_admin', 'direccion')) return await paginaAuditoria();
      else if (r === 'marca' && esRol('super_admin')) return await paginaMarca();
      return await paginaInicio();
    } catch (e) { console.error(e); $('view').append(h('div', { class: 'notice' }, 'No fue posible cargar la página: ' + msgErr(e))); }
  }

  // ---------------------------------------------------------------- sesión
  function cambiarPassword(obligatorio) {
    const p1 = h('input', { type: 'password', minlength: 10, maxlength: 72, required: true, autocomplete: 'new-password' }), p2 = h('input', { type: 'password', minlength: 10, maxlength: 72, required: true, autocomplete: 'new-password' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Cambiar contraseña');
    const d = dialogo(obligatorio ? 'Define tu contraseña' : 'Cambiar mi contraseña', h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault();
      if (p1.value !== p2.value) { toast('Las contraseñas no coinciden', 'bad'); return; } btn.disabled = true;
      try { await run(db.auth.updateUser({ password: p1.value })); if (obligatorio) { const ok = await run(db.rpc('confirmar_cambio_password')); if (!ok) { toast('Usa una contraseña distinta a la temporal', 'bad'); btn.disabled = false; return; } }
        toast('Contraseña actualizada', 'ok'); d.close(); if (obligatorio) iniciar(); } catch (err) { btn.disabled = false; } } },
      obligatorio ? h('p', {}, 'Tu contraseña actual es temporal. Define una propia para continuar; nadie más debe conocerla.') : null,
      h('label', { class: 'field' }, 'Nueva contraseña (mín. 10 caracteres)', p1), h('label', { class: 'field' }, 'Repite la contraseña', p2), h('div', { class: 'row' }, h('span', { class: 'grow' }), btn)));
    if (obligatorio) d.addEventListener('cancel', (e) => e.preventDefault());
  }
  function mostrar(login, msg) { $('login').classList.toggle('hidden', !login); $('app').classList.toggle('hidden', login); if (msg !== undefined) $('loginMsg').textContent = msg; }
  async function iniciar() {
    const { data } = await db.auth.getSession(); sesion = data.session; perfil = null;
    if (!sesion) return mostrar(true);
    let p = (await db.rpc('mi_perfil')).data;
    let aviso = 'Tu cuenta no tiene acceso asignado. Pide al administrador que la active.';
    if (p && !p.rol) { const { data: ok, error: eb } = await db.rpc('reclamar_bootstrap'); if (eb) aviso = 'No fue posible activar tu cuenta: ' + msgErr(eb); if (ok) p = (await db.rpc('mi_perfil')).data; }
    if (!p || !p.rol || !p.activo) { await db.auth.signOut(); return mostrar(true, aviso); }
    if (p.debe_cambiar_password) { mostrar(false); $('nav').replaceChildren(); $('view').replaceChildren(); $('who').textContent = p.email; return cambiarPassword(true); }
    perfil = p; const [d, s] = await Promise.all([db.rpc('directorio'), db.from('sucursales').select('*').order('nombre')]);
    dir = new Map((d.data || []).map((u) => [u.id, u])); sucursales = (s.data || []).filter((x) => x.activa);
    $('who').textContent = (perfil.nombre || perfil.email) + ' · ' + rolesNombre(perfil); mostrar(false); construirNav(); await ruta(); refrescarPendientes();
  }
  let reloj = null;
  const actividad = () => { clearTimeout(reloj); if (sesion) reloj = setTimeout(async () => { await db.auth.signOut(); toast('Sesión cerrada por inactividad', 'bad'); }, INACTIVIDAD_MIN * 60000); };

  if (!listo) { mostrar(true, 'Falta configurar la conexión (config.js).'); $('btnLogin').disabled = true; return; }
  cargarLogo();
  $('loginForm').addEventListener('submit', async (e) => { e.preventDefault(); $('btnLogin').disabled = true; $('loginMsg').textContent = '';
    const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value }); $('btnLogin').disabled = false; $('password').value = '';
    if (error) $('loginMsg').textContent = msgErr(error); });
  $('btnLogout').addEventListener('click', () => db.auth.signOut());
  $('btnPassword').addEventListener('click', () => cambiarPassword(false));
  window.addEventListener('hashchange', ruta);
  ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, actividad, { passive: true }));
  // SIGNED_IN también se emite al volver a la pestaña: solo se reinicia si cambió el usuario, para no perder un formulario abierto.
  db.auth.onAuthStateChange((evento, s) => { const uid = s && s.user ? s.user.id : null; const actual = sesion && sesion.user ? sesion.user.id : null;
    if (evento === 'SIGNED_OUT' || (evento === 'SIGNED_IN' && (uid !== actual || !perfil))) { filasCache.clear(); catCache.clear(); setTimeout(() => { iniciar(); actividad(); }, 0); }
    else if (s) sesion = s; });
  iniciar();
})();
