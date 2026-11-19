// La Dupla Admin · Definición de módulos (formatos LD-01 a LD-08, F2 Costos, F3 Financiero).
// Este archivo describe SOLO la estructura de cada formato (campos, cálculos y quién captura / revisa).
// No contiene datos del negocio: la plataforma arranca en blanco.
(function (root) {
  'use strict';

  // ---- Roles ----
  const ROLES = {
    super_admin: 'Super administrador',
    direccion: 'Dirección General',
    administrador: 'Administrador',
    jefe_operaciones: 'Jefe de Operaciones',
    lider_barra: 'Líder de barra',
    barista: 'Barista',
    comprador_almacenista: 'Comprador-almacenista',
    chofer: 'Chofer',
    encargado_cocina: 'Encargado de cocina',
    analista_contable: 'Analista contable',
    recursos_humanos: 'Recursos Humanos'
  };
  const SA = 'super_admin', DG = 'direccion', AD = 'administrador', JO = 'jefe_operaciones', LB = 'lider_barra',
    BA = 'barista', CA = 'comprador_almacenista', CH = 'chofer', EC = 'encargado_cocina', AC = 'analista_contable',
    RH = 'recursos_humanos';
  const OPERACION = [JO, LB, BA, CA, CH, EC];

  // ---- Constructores de campos ----
  const f = (t) => (k, l, x) => Object.assign({ k, l, t }, x || {});
  const T = f('texto'), A = f('nota'), N = f('numero'), M = f('dinero'), D = f('fecha'), H = f('hora'), P = f('pct');
  const S = (k, l, o, x) => Object.assign({ k, l, t: 'opcion', o }, x || {});
  const R = (k, l, m, etq, x) => Object.assign({ k, l, t: 'ref', ref: { m, etq } }, x || {});
  const C = (k, l, calc, fmt) => ({ k, l, t: 'calc', calc, fmt: fmt || 'num' });
  const L = (k, l, sub, x) => Object.assign({ k, l, t: 'lineas', sub }, x || {});

  const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
  const mins = (a, b) => { // diferencia en minutos entre dos horas HH:MM
    if (!a || !b) return null; const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
  };
  const dias = (a, b) => (!a || !b ? null : Math.round((new Date(b) - new Date(a)) / 86400000));
  const hoy = () => new Date().toISOString().slice(0, 10);

  const INSUMO = (x) => R('insumo', 'Insumo', 'f2_insumos', ['codigo', 'insumo'], x);
  const PERSONA = (k, l, x) => R(k, l, 'ld05_plantilla', ['nombre'], x);
  const PRODUCTO = (k, l, x) => R(k || 'producto', l || 'Producto', 'f2_menu', ['producto'], x);
  const TURNO = S('turno', 'Turno', ['T1', 'T2', 'FDS']);
  const SINO = ['Sí', 'No'];
  const DIASEM = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
  const DIASL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const estadoFC = (fc) => fc === null ? '' : fc <= 0.30 ? 'Excelente' : fc <= 0.35 ? 'Aceptable' : fc <= 0.40 ? 'Alto' : 'Crítico';

  const LIBROS = [
    { clave: 'ld01', nombre: 'LD-01 · Inventarios y Compras' },
    { clave: 'ld02', nombre: 'LD-02 · Operación de Cafetería' },
    { clave: 'ld03', nombre: 'LD-03 · Cocina Praderas y Chef' },
    { clave: 'ld04', nombre: 'LD-04 · Ruta y Logística' },
    { clave: 'ld05', nombre: 'LD-05 · Personal y Gestión' },
    { clave: 'ld06', nombre: 'LD-06 · Organización, Puestos y RACI' },
    { clave: 'ld07', nombre: 'LD-07 · Procesos, KPIs, Plan y Riesgos' },
    { clave: 'ld08', nombre: 'LD-08 · Ventas y Punto de Equilibrio' },
    { clave: 'f2', nombre: 'F2 · Modelo de Costos' },
    { clave: 'f3', nombre: 'F3 · Modelo Financiero' }
  ];

  // Cada módulo: clave, libro, nombre, tipo (tabla | checklist | unico), ayuda, frecuencia,
  // cap (roles que capturan), rev (roles que revisan), ver (roles extra de consulta), solo (lista cerrada de consulta),
  // campos, revision (campos que llena quien revisa), items (checklist), catalogo (campos públicos para listas).
  const M_ = [];
  const mod = (o) => M_.push(o);

  // =========================== LD-01 · Inventarios y Compras ===========================
  mod({ clave: 'ld01_parametros', libro: 'ld01', nombre: 'Parámetros', tipo: 'unico', frecuencia: 'Se define una vez; revisión trimestral',
    ayuda: 'Valores que alimentan los cálculos del libro. Cada cambio queda con historial.',
    cap: [AD, JO], rev: [DG], ver: OPERACION.concat([AC]),
    campos: [H('corte', 'Hora de corte de requisición'), H('salida', 'Hora de salida de ruta CEDIS → cafetería'),
      P('tol_inv', 'Tolerancia de diferencia entre conteo 1 y 2 (%)'), N('meta_merma_pan', 'Meta de merma de pan por día (piezas)'),
      P('tol_recep', 'Tolerancia de diferencia en recepción (%)'), M('tope_efectivo', 'Tope de compra en efectivo sin autorización ($)')] });

  mod({ clave: 'ld01_inv_conteos', libro: 'ld01', nombre: 'Inventario general · conteos', tipo: 'tabla',
    frecuencia: 'Inventario inicial y después por frecuencia definida',
    ayuda: 'Doble conteo: el conteo 1 y el conteo 2 los capturan personas distintas. Si la diferencia excede la tolerancia, una tercera persona hace el recuento (conteo 3). La conciliación se calcula en "Inventario general · conciliación".',
    cap: [CA, LB, BA, EC, JO], rev: [JO, AD, DG], ver: [AC],
    campos: [S('ubicacion', 'Ubicación', ['Cafetería', 'CEDIS Praderas', 'Cocina Praderas', 'Oficina / bodega'], { req: 1 }),
      INSUMO({ req: 1 }), T('unidad', 'Unidad de compra'), S('conteo', 'Número de conteo', ['1', '2', '3 (recuento)'], { req: 1 }),
      N('cantidad', 'Cantidad contada', { req: 1 }), N('cant_sistema', 'Cantidad en sistema (si existe)'),
      A('obs', 'Observación (caducidad, daño, lote)')] });

  mod({ clave: 'ld01_frecuencias', libro: 'ld01', nombre: 'Frecuencias de inventario', tipo: 'tabla', frecuencia: 'Se define una vez; revisión trimestral',
    ayuda: 'Cada cuánto se cuenta cada categoría de insumo.',
    cap: [JO], rev: [DG], ver: [CA, AD, AC, LB],
    campos: [T('categoria', 'Categoría', { req: 1 }), S('frecuencia', 'Frecuencia', ['Diaria', 'Semanal', 'Quincenal', 'Mensual', 'Trimestral', 'Semestral'], { req: 1 }),
      T('responsable', 'Responsable del conteo'), T('revisa', 'Revisa'), D('ultimo', 'Último conteo'), D('proximo', 'Próximo conteo'), A('obs', 'Observación')] });

  mod({ clave: 'ld01_activos_fijos', libro: 'ld01', nombre: 'Activos fijos y equipo', tipo: 'tabla', frecuencia: 'Inventario inicial y revisión semestral',
    ayuda: 'Un renglón por equipo: marca, modelo, serie, estado y mantenimiento.',
    cap: [JO, AD], rev: [DG], ver: [AC],
    campos: [S('ubicacion', 'Ubicación', ['Cafetería', 'Praderas cocina', 'CEDIS Praderas', 'Oficina'], { req: 1 }), T('categoria', 'Categoría'),
      T('equipo', 'Equipo / activo', { req: 1 }), T('marca', 'Marca'), T('modelo', 'Modelo'), T('serie', 'No. de serie'), N('cantidad', 'Cantidad'),
      S('estado', 'Estado', ['Bueno', 'Regular', 'Malo', 'Fuera de servicio']), T('responsable', 'Responsable'), D('adquisicion', 'Fecha de adquisición'),
      M('valor', 'Valor aprox.'), D('mantenimiento', 'Mantenimiento próximo'), A('obs', 'Observación')] });

  mod({ clave: 'ld01_requisicion', libro: 'ld01', nombre: 'Requisición diaria', tipo: 'tabla', frecuencia: 'Diario, antes del corte',
    ayuda: 'La cafetería captura lo que falta ANTES de la hora de corte. Quien surte registra el surtido real al revisar.',
    cap: [BA, LB], rev: [CA, JO], ver: [CH, EC, AD],
    campos: [H('hora', 'Hora de captura', { req: 1 }), INSUMO({ req: 1 }), T('unidad', 'Unidad'), N('existencia', 'Existencia en café', { req: 1 }),
      N('objetivo', 'Stock objetivo', { req: 1 }),
      C('a_pedir', 'A pedir', (d) => (n(d.existencia) === null || n(d.objetivo) === null ? null : Math.max(n(d.objetivo) - n(d.existencia), 0))),
      S('prioridad', 'Prioridad', ['Alta', 'Media', 'Baja']),
      C('fuera_corte', 'Fuera de corte', (d, c) => (!d.hora || !c.params.corte ? '' : (mins(c.params.corte, d.hora) > 0 ? 'Sí' : 'No')), 'txt'),
      A('obs', 'Observación')],
    revision: [N('surtido', 'Surtido real'),
      C('pendiente', 'Pendiente', (d, c, rv) => (n(rv.surtido) === null || n(d.objetivo) === null ? null : Math.max(Math.max(n(d.objetivo) - n(d.existencia), 0) - n(rv.surtido), 0))),
      A('nota', 'Nota de quien surte')] });

  mod({ clave: 'ld01_recepcion', libro: 'ld01', nombre: 'Recepción · contrarrecibo', tipo: 'tabla', frecuencia: 'Cada entrega',
    ayuda: 'Cada entrega se verifica contra la requisición. Toda diferencia se anota.',
    cap: [BA, LB], rev: [JO], ver: [CA, CH, AD, AC],
    campos: [H('hora', 'Hora de llegada'), S('origen', 'Origen', ['CEDIS Praderas', 'Cocina Praderas', 'Proveedor directo']), T('folio', 'Folio / remisión'),
      INSUMO({ req: 1 }), N('pedida', 'Cant. pedida', { req: 1 }), N('recibida', 'Cant. recibida', { req: 1 }),
      C('dif', 'Diferencia', (d) => (n(d.pedida) === null || n(d.recibida) === null ? null : r2(n(d.recibida) - n(d.pedida)))),
      N('temp', 'Temp. °C (refrigerado)'), S('estado', 'Estado', ['Conforme', 'Dañado', 'Incompleto', 'Rechazado']),
      T('entrego', 'Entregó'), A('obs', 'Observación')] });

  mod({ clave: 'ld01_pan_diario', libro: 'ld01', nombre: 'Control diario de pan', tipo: 'tabla', frecuencia: 'Cierre de cada día',
    ayuda: 'Pedido – venta – merma por producto de panadería.',
    cap: [BA, LB], rev: [JO], ver: [EC, AD, CA],
    campos: [PRODUCTO('producto', 'Producto de panadería', { req: 1 }), N('pedido', 'Pedido (pzas)', { req: 1 }), N('vendido', 'Vendido (pzas)', { req: 1 }),
      N('merma', 'Merma (pzas)'),
      C('sobrante', 'Sobrante', (d) => (n(d.pedido) === null || n(d.vendido) === null ? null : n(d.pedido) - n(d.vendido) - (n(d.merma) || 0))),
      C('pct_merma', '% merma', (d) => (!n(d.pedido) ? null : (n(d.merma) || 0) / n(d.pedido)), 'pct'),
      T('causa', 'Causa de merma'), A('obs', 'Observación')] });

  mod({ clave: 'ld01_merma', libro: 'ld01', nombre: 'Merma general', tipo: 'tabla', frecuencia: 'En el momento',
    ayuda: 'Todo lo que se tira, se regala o se descompone. La revisión del Jefe de Operaciones equivale a la autorización.',
    cap: [BA, LB, CA], rev: [JO], ver: [AD, AC, EC],
    campos: [TURNO, INSUMO({ l: 'Insumo / producto', req: 1 }), N('cantidad', 'Cantidad', { req: 1 }), T('unidad', 'Unidad'),
      S('causa', 'Causa', ['Caducidad', 'Daño', 'Error de preparación', 'Devolución de cliente', 'Cortesía', 'Otro'], { req: 1 }),
      M('costo', 'Costo estimado'), A('obs', 'Observación')] });

  mod({ clave: 'ld01_fondo_efectivo', libro: 'ld01', nombre: 'Fondo de compras en efectivo', tipo: 'tabla', frecuencia: 'Cada compra',
    ayuda: 'Toda compra en efectivo exige comprobante. Arriba del tope requiere autorización previa. Quien compra no revisa su propio movimiento.',
    cap: [CA, AD], rev: [AD, DG], ver: [AC, JO], saldo: { ingreso: 'ingreso', egreso: 'egreso' },
    campos: [S('tipo', 'Movimiento', ['Ingreso al fondo', 'Egreso (compra)'], { req: 1 }), T('concepto', 'Concepto / proveedor', { req: 1 }),
      M('ingreso', 'Ingreso al fondo'), M('egreso', 'Egreso'), T('comprobante', 'Comprobante (folio)'),
      C('sobre_tope', 'Sobre el tope', (d, c) => (n(d.egreso) === null || n(c.params.tope_efectivo) === null ? '' : (n(d.egreso) > n(c.params.tope_efectivo) ? 'Sí — requiere autorización' : 'No')), 'txt'),
      A('obs', 'Observación')] });

  // =========================== LD-02 · Operación de Cafetería ===========================
  mod({ clave: 'ld02_parametros', libro: 'ld02', nombre: 'Parámetros', tipo: 'unico', frecuencia: 'Se define una vez',
    ayuda: 'Metas y tolerancias de la operación de barra y caja.',
    cap: [AD, JO], rev: [DG], ver: OPERACION,
    campos: [N('meta_bebida', 'Meta de tiempo de bebida (segundos)'), M('tol_caja', 'Tolerancia de diferencia de caja ($)'),
      M('fondo', 'Fondo de cambio inicial autorizado ($)'), N('temp_max', 'Temperatura máxima de refrigeración (°C)'), T('cierre_pub', 'Hora de cierre al público')] });

  const CHK = [S('turno', 'Turno', ['T1', 'T2', 'FDS'], { req: 1 })];
  mod({ clave: 'ld02_apertura', libro: 'ld02', nombre: 'Checklist de apertura', tipo: 'checklist', frecuencia: 'Diario',
    ayuda: 'Marcar OK / Falla. Una falla se anota en Observación y se reporta al Jefe de Operaciones antes de abrir.',
    cap: [BA, LB], rev: [JO], ver: [AD], campos: CHK,
    items: ['Encender equipos (espresso, molino, refrigeración, POS)', 'Verificar temperatura de refrigeradores', 'Revisar que haya agua y energía',
      'Calibrar molienda y probar shot de espresso', 'Revisar recepción del pan / producto del día vs requisición', 'Fondo de cambio contado y registrado',
      'POS abierto, turno iniciado, KDS / monitor de producción activo', 'Vitrina surtida y etiquetas con fecha', 'Limpieza de área de clientes y baños',
      'Menú digital / QR visible y precios vigentes', 'Pendientes del turno anterior leídos (Bitácora)'] });
  mod({ clave: 'ld02_cierre', libro: 'ld02', nombre: 'Checklist de cierre', tipo: 'checklist', frecuencia: 'Diario',
    ayuda: 'Se hace en el cierre del turno. El corte de caja se registra en su propio formato.',
    cap: [BA, LB], rev: [JO], ver: [AD], campos: CHK,
    items: ['Corte de caja realizado y conciliado', 'Cierre de turno en POS e impresión del reporte', 'Pan / producto sobrante registrado en Control diario de pan',
      'Merma del día registrada', 'Requisición del día siguiente capturada', 'Equipos limpios y apagados (espresso, molino, licuadoras)',
      'Producto refrigerado cubierto, etiquetado y con fecha', 'Superficies, piso y baños limpios', 'Basura sacada y contenedores limpios',
      'Puertas, ventanas y alarma cerradas', 'Pendientes del turno registrados en Bitácora'] });
  mod({ clave: 'ld02_limpieza', libro: 'ld02', nombre: 'Limpieza programada', tipo: 'checklist', frecuencia: 'Diaria / semanal / mensual',
    ayuda: 'Actividades de limpieza que no caben en el cierre. Marca N/A lo que no corresponde a la fecha.',
    cap: [BA, LB], rev: [AD, JO], ver: [], campos: CHK,
    items: ['Diaria: barra, máquina de espresso (retrolavado), molino', 'Diaria: refrigeradores por fuera, vitrina', 'Semanal: limpieza profunda de refrigeradores',
      'Semanal: descalcificación / revisión de filtros de agua', 'Semanal: campana, extractores y rejillas', 'Mensual: revisión de plagas / fumigación (comprobante)',
      'Mensual: limpieza de tanque / cisterna y revisión de agua', 'Mensual: mantenimiento preventivo de espresso'] });

  mod({ clave: 'ld02_corte_caja', libro: 'ld02', nombre: 'Corte de caja', tipo: 'tabla', frecuencia: 'Cada turno / día',
    ayuda: 'Concilia lo que dice el POS contra el efectivo contado y el voucher de la terminal. Quien cierra caja NO revisa su propio corte.',
    cap: [BA, LB], rev: [JO, AD], ver: [AC, DG],
    campos: [S('turno', 'Turno', ['T1', 'T2', 'FDS'], { req: 1 }), M('fondo', 'Fondo inicial', { req: 1 }), M('ventas_efectivo', 'Ventas efectivo (POS)', { req: 1 }),
      M('ventas_tarjeta', 'Ventas tarjeta (POS)', { req: 1 }), M('efectivo_contado', 'Efectivo contado', { req: 1 }), M('voucher', 'Voucher terminal'),
      M('retiros', 'Retiros / gastos'),
      C('dif_efectivo', 'Dif. efectivo', (d) => (n(d.efectivo_contado) === null ? null : r2(n(d.efectivo_contado) - ((n(d.fondo) || 0) + (n(d.ventas_efectivo) || 0) - (n(d.retiros) || 0)))), 'dinero'),
      C('dif_tarjeta', 'Dif. tarjeta', (d) => (n(d.ventas_tarjeta) === null || n(d.voucher) === null ? null : r2(n(d.voucher) - n(d.ventas_tarjeta))), 'dinero'),
      C('alerta', 'Fuera de tolerancia', (d, c) => { const t = n(c.params.tol_caja); if (t === null || n(d.efectivo_contado) === null) return '';
        const de = Math.abs(n(d.efectivo_contado) - ((n(d.fondo) || 0) + (n(d.ventas_efectivo) || 0) - (n(d.retiros) || 0))); return de > t ? 'Sí' : 'No'; }, 'txt'),
      A('obs', 'Observación')] });

  mod({ clave: 'ld02_propinas', libro: 'ld02', nombre: 'Reparto semanal de propinas', tipo: 'tabla', frecuencia: 'Semanal',
    ayuda: 'Total de propinas de la semana y turnos trabajados por colaborador; la parte de cada quien se calcula sola.',
    cap: [LB, JO], rev: [AD, RH], ver: [DG],
    campos: [D('semana', 'Semana (día de corte)', { req: 1 }), M('efectivo', 'Total propinas efectivo'), M('tarjeta', 'Total propinas tarjeta'),
      C('total', 'Total a repartir', (d) => r2((n(d.efectivo) || 0) + (n(d.tarjeta) || 0)), 'dinero'),
      L('reparto', 'Colaboradores', [PERSONA('colaborador', 'Colaborador'), N('turnos', 'Turnos trabajados')],
        { calcLinea: { l: 'Parte', fmt: 'dinero', fn: (ln, d) => { const tot = (n(d.efectivo) || 0) + (n(d.tarjeta) || 0);
          const st = (d.reparto || []).reduce((a, x) => a + (n(x.turnos) || 0), 0); return !st ? null : r2(tot * (n(ln.turnos) || 0) / st); } } })] });

  mod({ clave: 'ld02_tiempos_bebida', libro: 'ld02', nombre: 'Tiempos de preparación', tipo: 'tabla', frecuencia: '2 veces por semana en hora pico',
    ayuda: 'Medir con cronómetro. La meta sale de Parámetros.',
    cap: [JO, LB], rev: [JO, DG], ver: [BA, AD],
    campos: [H('hora', 'Hora', { req: 1 }), PRODUCTO('producto', 'Bebida / producto', { req: 1 }), N('segundos', 'Tiempo (seg)', { req: 1 }),
      C('meta', 'Meta (seg)', (d, c) => n(c.params.meta_bebida)),
      C('cumple', 'Cumple', (d, c) => (n(d.segundos) === null || n(c.params.meta_bebida) === null ? '' : (n(d.segundos) <= n(c.params.meta_bebida) ? 'Sí' : 'No')), 'txt'),
      PERSONA('barista', 'Barista'), A('obs', 'Causa de demora')] });

  mod({ clave: 'ld02_calidad_bebida', libro: 'ld02', nombre: 'Calidad de barra', tipo: 'tabla', frecuencia: 'Inicio de turno',
    ayuda: 'Calibración de espresso y prueba de bebida.',
    cap: [BA, LB], rev: [JO], ver: [AD],
    campos: [TURNO, N('dosis', 'Dosis (g)'), N('rendimiento', 'Rendimiento (g)'), N('extraccion', 'Tiempo de extracción (s)'), N('temp_leche', 'Temp. leche °C'),
      S('sabor', 'Sabor / balance (1-5)', ['1', '2', '3', '4', '5']), A('ajuste', 'Ajuste realizado')] });

  mod({ clave: 'ld02_temperaturas', libro: 'ld02', nombre: 'Temperaturas de refrigeración', tipo: 'tabla', frecuencia: '2 veces al día',
    ayuda: 'Dos lecturas por día (apertura y cierre). El límite sale de Parámetros.',
    cap: [BA, LB], rev: [JO], ver: [AD, EC],
    campos: [H('hora', 'Hora', { req: 1 }), T('equipo', 'Equipo', { req: 1 }), N('temp', 'Temp. °C', { req: 1 }),
      C('limite', 'Límite °C', (d, c) => n(c.params.temp_max)),
      C('en_rango', 'En rango', (d, c) => (n(d.temp) === null || n(c.params.temp_max) === null ? '' : (n(d.temp) <= n(c.params.temp_max) ? 'Sí' : 'No')), 'txt'),
      A('accion', 'Acción correctiva')] });

  mod({ clave: 'ld02_rol_turnos', libro: 'ld02', nombre: 'Rol semanal de turnos', tipo: 'tabla', frecuencia: 'Semanal',
    ayuda: 'Una fila por colaborador. T1, T2, FDS o D (descanso).',
    cap: [JO, LB], rev: [DG, AD], ver: [BA, RH, CA, CH, EC],
    campos: [D('semana', 'Semana del', { req: 1 }), PERSONA('colaborador', 'Colaborador', { req: 1 }), T('puesto', 'Puesto')]
      .concat(DIASEM.map((k, i) => S(k, DIASL[i], ['T1', 'T2', 'FDS', 'D'])))
      .concat([C('turnos', 'Turnos de la semana', (d) => DIASEM.filter((k) => ['T1', 'T2', 'FDS'].includes(d[k])).length)]) });

  mod({ clave: 'ld02_bitacora', libro: 'ld02', nombre: 'Bitácora de turno e incidencias', tipo: 'tabla', frecuencia: 'Cuando ocurra',
    ayuda: 'Todo lo que el siguiente turno debe saber.',
    cap: [BA, LB, JO, CA, CH, EC], rev: [JO, AD], ver: [DG],
    campos: [H('hora', 'Hora'), TURNO, S('tipo', 'Tipo', ['Incidencia', 'Equipo', 'Cliente', 'Faltante', 'Seguridad', 'Aviso', 'Otro'], { req: 1 }),
      A('descripcion', 'Descripción', { req: 1 }), A('accion', 'Acción tomada'), S('seguimiento', 'Requiere seguimiento', SINO), T('responsable', 'Responsable'),
      D('cerrado', 'Cerrado (fecha)')] });

  mod({ clave: 'ld02_contingencias', libro: 'ld02', nombre: 'Plan de contingencias', tipo: 'tabla', frecuencia: 'Se llena una vez; revisión trimestral',
    ayuda: 'Qué hacer, quién decide y a quién avisar ante agua, equipo, vehículo, sistema, energía o personal.',
    cap: [JO], rev: [DG], ver: [BA, LB, CA, CH, EC, AD],
    campos: [T('contingencia', 'Contingencia', { req: 1 }), A('que_pasa', 'Qué pasa'), A('primera_accion', 'Primera acción'), T('decide', 'Quién decide'),
      T('avisar', 'A quién avisar'), T('telefono', 'Teléfono'), A('plan_b', 'Plan B'), T('tiempo_max', 'Tiempo máx. de respuesta')] });

  // =========================== LD-03 · Cocina Praderas y Chef ===========================
  mod({ clave: 'ld03_parametros', libro: 'ld03', nombre: 'Parámetros', tipo: 'unico', frecuencia: 'Se define una vez',
    ayuda: 'Anticipación de órdenes, temperaturas límite y tolerancia de rendimiento.',
    cap: [JO, EC], rev: [DG], ver: OPERACION.concat([AD]),
    campos: [N('anticipo', 'Anticipación de la orden de producción (días)'), N('temp_cong', 'Temperatura máx. de congelación (°C)'),
      N('temp_ref', 'Temperatura máx. de refrigeración (°C)'), P('tol_rend', 'Tolerancia de rendimiento vs receta (%)')] });

  mod({ clave: 'ld03_orden_produccion', libro: 'ld03', nombre: 'Orden de producción', tipo: 'tabla', frecuencia: 'Con la anticipación definida',
    ayuda: 'Cafetería → cocina. El Encargado de cocina confirma y registra lo producido al revisar.',
    cap: [JO, LB], rev: [EC], ver: [BA, CA, AD],
    campos: [D('fecha_produccion', 'Fecha de producción', { req: 1 }),
      C('anticipacion', 'Anticipación (días)', (d, c, rv, reg) => dias(reg.fecha, d.fecha_produccion)),
      PRODUCTO('producto', 'Producto', { req: 1 }), T('receta_version', 'Receta (versión)'), N('solicitada', 'Cantidad solicitada', { req: 1 }), T('unidad', 'Unidad'),
      T('para', 'Para (cafetería / sucursal)'), A('obs', 'Observación')],
    revision: [N('producida', 'Cantidad producida'),
      C('dif', 'Diferencia', (d, c, rv) => (n(rv.producida) === null ? null : r2(n(rv.producida) - (n(d.solicitada) || 0)))), A('nota', 'Nota de cocina')] });

  mod({ clave: 'ld03_recetas_versiones', libro: 'ld03', nombre: 'Control de versiones de recetas', tipo: 'tabla', frecuencia: 'Cada cambio de receta',
    ayuda: 'Una receta cambia SOLO con este registro. La revisión de Dirección equivale a la autorización.',
    cap: [EC], rev: [DG, AD], ver: [JO, LB],
    campos: [PRODUCTO('producto', 'Producto', { req: 1 }), T('version', 'Versión', { req: 1 }), A('que_cambio', 'Qué cambió', { req: 1 }), A('motivo', 'Motivo'),
      M('costo_anterior', 'Costo anterior'), M('costo_nuevo', 'Costo nuevo'), D('vigente', 'Vigente desde'), T('comunicado', 'Comunicado a'), A('obs', 'Observación')] });

  mod({ clave: 'ld03_lotes', libro: 'ld03', nombre: 'Producción y lotes', tipo: 'tabla', frecuencia: 'En cada producción',
    ayuda: 'Cada lote lleva etiqueta con producto, fecha y caducidad (trazabilidad).',
    cap: [EC], rev: [JO], ver: [CA, AD, LB],
    campos: [T('lote', 'Lote', { req: 1 }), PRODUCTO('producto', 'Producto', { req: 1 }), T('receta_version', 'Receta (versión)'), N('producida', 'Cantidad producida', { req: 1 }),
      T('unidad', 'Unidad'), N('teorico', 'Rendimiento teórico'),
      C('rend', 'Rend. real vs teórico', (d) => (!n(d.teorico) || n(d.producida) === null ? null : n(d.producida) / n(d.teorico) - 1), 'pct'),
      C('fuera_tol', 'Fuera de tolerancia', (d, c) => { const t = n(c.params.tol_rend); if (t === null || !n(d.teorico) || n(d.producida) === null) return '';
        return Math.abs(n(d.producida) / n(d.teorico) - 1) > t ? 'Sí' : 'No'; }, 'txt'),
      D('caducidad', 'Fecha de caducidad'), T('almacen', 'Almacén'), T('destino', 'Destino'), A('obs', 'Observación')] });

  mod({ clave: 'ld03_recepcion_mp', libro: 'ld03', nombre: 'Recepción de materia prima', tipo: 'tabla', frecuencia: 'Cada entrega',
    ayuda: 'Verificar contra la orden de compra, estado, temperatura y caducidad.',
    cap: [CA], rev: [JO, EC], ver: [AD, AC, CH],
    campos: [T('proveedor', 'Proveedor', { req: 1 }), T('folio', 'Folio / factura'), INSUMO({ req: 1 }), N('pedida', 'Cant. pedida', { req: 1 }), N('recibida', 'Cant. recibida', { req: 1 }),
      C('dif', 'Diferencia', (d) => (n(d.pedida) === null || n(d.recibida) === null ? null : r2(n(d.recibida) - n(d.pedida)))),
      N('temp', 'Temp. °C'), D('caducidad', 'Caducidad'), S('cumple', 'Cumple especificación', SINO), A('obs', 'Observación')] });

  mod({ clave: 'ld03_temperaturas', libro: 'ld03', nombre: 'Temperaturas de cocina', tipo: 'tabla', frecuencia: '2 veces al día',
    ayuda: 'Registrar al inicio y al final de la jornada.',
    cap: [EC], rev: [JO], ver: [AD],
    campos: [H('hora', 'Hora', { req: 1 }), T('equipo', 'Equipo', { req: 1 }), S('tipo', 'Tipo', ['Refrigeración', 'Congelación'], { req: 1 }), N('temp', 'Temp. °C', { req: 1 }),
      C('limite', 'Límite °C', (d, c) => (d.tipo === 'Congelación' ? n(c.params.temp_cong) : n(c.params.temp_ref))),
      C('en_rango', 'En rango', (d, c) => { const l = d.tipo === 'Congelación' ? n(c.params.temp_cong) : n(c.params.temp_ref);
        return n(d.temp) === null || l === null ? '' : (n(d.temp) <= l ? 'Sí' : 'No'); }, 'txt'),
      A('accion', 'Acción correctiva')] });

  mod({ clave: 'ld03_inocuidad', libro: 'ld03', nombre: 'Checklist de inocuidad', tipo: 'checklist', frecuencia: 'Semanal',
    ayuda: 'Los puntos en "Falla" requieren fecha compromiso de corrección (anótala en la observación).',
    cap: [EC, JO], rev: [DG, AD], ver: [], campos: [],
    items: ['Personal con uniforme limpio, cabello cubierto y sin joyas', 'Lavado de manos: lavamanos con jabón y toallas', 'Superficies y utensilios sanitizados',
      'Separación de crudo y cocido', 'Producto etiquetado con fecha y lote', 'PEPS respetado en refrigeración y almacén', 'Productos químicos separados de alimentos',
      'Control de plagas vigente (comprobante)', 'Basura tapada y sacada diariamente', 'Agua potable y estado de tanque / cisterna', 'Botiquín completo y vigente'] });

  mod({ clave: 'ld03_merma_cocina', libro: 'ld03', nombre: 'Merma de cocina', tipo: 'tabla', frecuencia: 'En el momento',
    ayuda: 'Merma de producción, caducidad y desperdicio.',
    cap: [EC], rev: [JO], ver: [AD, AC],
    campos: [INSUMO({ l: 'Insumo / producto', req: 1 }), N('cantidad', 'Cantidad', { req: 1 }), T('unidad', 'Unidad'),
      S('causa', 'Causa', ['Producción', 'Caducidad', 'Daño', 'Error', 'Otro'], { req: 1 }), M('costo', 'Costo estimado'), A('obs', 'Observación')] });

  mod({ clave: 'ld03_alta_producto', libro: 'ld03', nombre: 'Alta de producto nuevo', tipo: 'tabla', frecuencia: 'Antes de cada lanzamiento',
    ayuda: 'Un producto nuevo no se vende hasta cerrar todos los puntos y contar con la revisión de Dirección.',
    cap: [EC, JO], rev: [DG], ver: [AD, LB],
    campos: [T('producto', 'Producto nuevo', { req: 1 }), S('receta_costo', 'Receta con costo calculado', SINO), M('precio', 'Precio autorizado'),
      S('alta_pos', 'Alta en POS', SINO), S('alta_menu', 'Alta en menú digital / QR', SINO), S('etiqueta', 'Etiqueta nutrimental / alérgenos', SINO),
      S('foto', 'Fotografía', SINO), S('capacitacion', 'Capacitación al personal', SINO), D('lanzamiento', 'Fecha de lanzamiento'),
      C('listo', 'Listo para vender', (d) => (['receta_costo', 'alta_pos', 'alta_menu', 'etiqueta', 'foto', 'capacitacion'].every((k) => d[k] === 'Sí') && n(d.precio) ? 'Sí' : 'No'), 'txt')] });

  // =========================== LD-04 · Ruta y Logística ===========================
  mod({ clave: 'ld04_parametros', libro: 'ld04', nombre: 'Parámetros', tipo: 'unico', frecuencia: 'Se define una vez',
    ayuda: 'Corte, salida y referencias de la camioneta.',
    cap: [JO, CA], rev: [AD, DG], ver: [CH, LB],
    campos: [H('corte', 'Corte de requisición'), H('salida', 'Salida de ruta'), N('rend_ref', 'Rendimiento de referencia (km/litro)'), M('precio_litro', 'Precio del combustible ($/litro)')] });

  mod({ clave: 'ld04_hoja_ruta', libro: 'ld04', nombre: 'Hoja de ruta diaria', tipo: 'tabla', frecuencia: 'Diario',
    ayuda: 'Una por día. Cerrar la carga contra la requisición.',
    cap: [CH, CA], rev: [JO], ver: [LB, AD],
    campos: [H('req_cerrada', 'Requisición cerrada (hora)'), H('salida_prog', 'Salida programada', { req: 1 }), H('salida_real', 'Salida real', { req: 1 }),
      C('atraso', 'Atraso (min)', (d) => mins(d.salida_prog, d.salida_real)), H('llegada', 'Llegada a cafetería'),
      C('trayecto', 'Trayecto (min)', (d) => mins(d.salida_real, d.llegada)), N('bultos', 'Bultos / piezas cargadas'),
      S('conforme', 'Entrega conforme', SINO), A('obs', 'Observación')] });

  mod({ clave: 'ld04_carga_entrega', libro: 'ld04', nombre: 'Lista de carga y entrega', tipo: 'tabla', frecuencia: 'Diario',
    ayuda: 'Cruza la requisición, lo cargado en CEDIS y lo recibido. Quien recibe en cafetería registra lo recibido al revisar.',
    cap: [CA, CH], rev: [BA, LB, JO], ver: [AD],
    campos: [INSUMO({ req: 1 }), N('pedido', 'Pedido (requisición)', { req: 1 }), N('cargado', 'Cargado en CEDIS', { req: 1 }),
      C('dif_carga', 'Dif. carga vs pedido', (d) => (n(d.pedido) === null || n(d.cargado) === null ? null : r2(n(d.cargado) - n(d.pedido)))), A('obs', 'Observación')],
    revision: [N('recibido', 'Recibido en cafetería'),
      C('dif_recibo', 'Dif. recibo vs carga', (d, c, rv) => (n(rv.recibido) === null || n(d.cargado) === null ? null : r2(n(rv.recibido) - n(d.cargado)))),
      N('temp', 'Temp. °C (frío)'), A('nota', 'Nota de recepción')] });

  mod({ clave: 'ld04_bitacora_camioneta', libro: 'ld04', nombre: 'Bitácora de la camioneta', tipo: 'tabla', frecuencia: 'Diario',
    ayuda: 'Kilometraje, combustible y estado del vehículo.',
    cap: [CH, CA], rev: [JO], ver: [AD, AC],
    campos: [N('km_salida', 'Km salida', { req: 1 }), N('km_llegada', 'Km llegada', { req: 1 }),
      C('recorrido', 'Recorrido (km)', (d) => (n(d.km_salida) === null || n(d.km_llegada) === null ? null : n(d.km_llegada) - n(d.km_salida))),
      N('litros', 'Litros cargados'), M('costo', 'Costo combustible'),
      C('rendimiento', 'Rendimiento km/l', (d) => (!n(d.litros) || n(d.km_salida) === null || n(d.km_llegada) === null ? null : r2((n(d.km_llegada) - n(d.km_salida)) / n(d.litros)))),
      S('estado', 'Estado del vehículo', ['Bueno', 'Regular', 'Requiere atención']), A('incidente', 'Incidente'), A('obs', 'Observación')] });

  mod({ clave: 'ld04_mantenimiento', libro: 'ld04', nombre: 'Mantenimiento del vehículo', tipo: 'tabla', frecuencia: 'Cada servicio',
    ayuda: 'Preventivo y correctivo; programar por kilometraje y fecha.',
    cap: [JO, CA], rev: [AD], ver: [CH, AC, DG],
    campos: [N('km', 'Km'), S('tipo', 'Tipo', ['Preventivo', 'Correctivo'], { req: 1 }), T('concepto', 'Concepto', { req: 1 }), T('proveedor', 'Proveedor'),
      M('costo', 'Costo'), N('proximo_km', 'Próximo servicio (km)'), D('proxima_fecha', 'Próxima fecha'), T('documento', 'Documento (folio)'), A('obs', 'Observación')] });

  mod({ clave: 'ld04_incidencias', libro: 'ld04', nombre: 'Incidencias de ruta y entrega', tipo: 'tabla', frecuencia: 'Cuando ocurra',
    ayuda: 'Retrasos, faltantes, daños y producto rechazado.',
    cap: [CH, BA, LB, CA], rev: [JO], ver: [AD],
    campos: [H('hora', 'Hora'), S('tipo', 'Tipo', ['Retraso', 'Faltante', 'Daño', 'Producto rechazado', 'Vehículo', 'Otro'], { req: 1 }), A('descripcion', 'Descripción', { req: 1 }),
      A('impacto', 'Impacto'), A('accion', 'Acción tomada'), T('responsable', 'Responsable'), D('cerrado', 'Cerrado (fecha)')] });

  // =========================== LD-05 · Personal y Gestión ===========================
  mod({ clave: 'ld05_parametros', libro: 'ld05', nombre: 'Parámetros', tipo: 'unico', frecuencia: 'Se define una vez',
    ayuda: 'Periodo de adaptación y meta de rotación.',
    cap: [RH], rev: [DG], ver: [JO, AD],
    campos: [N('dias_prueba', 'Días del periodo de adaptación / evaluación'), P('meta_rotacion', 'Meta de rotación mensual (%)')] });

  mod({ clave: 'ld05_plantilla', libro: 'ld05', nombre: 'Plantilla', tipo: 'tabla', frecuencia: 'Alta / baja', catalogo: ['nombre', 'puesto'],
    ayuda: 'Un renglón por persona activa. Sin datos de sueldo.',
    cap: [RH], rev: [DG], ver: [JO, AD, LB],
    campos: [T('nombre', 'Nombre', { req: 1 }), T('puesto', 'Puesto', { req: 1 }), T('area', 'Área'), T('reporta', 'Reporta a'), S('turno', 'Turno', ['T1', 'T2', 'FDS', 'Mixto', 'N/A']),
      D('ingreso', 'Fecha de ingreso'), C('antiguedad', 'Antigüedad (días)', (d) => dias(d.ingreso, hoy())), S('estatus', 'Estatus', ['Activo', 'Baja', 'Incapacidad', 'Vacante']),
      A('obs', 'Observación')] });

  mod({ clave: 'ld05_asistencia', libro: 'ld05', nombre: 'Asistencia semanal', tipo: 'tabla', frecuencia: 'Diario',
    ayuda: 'A asistencia · R retardo · F falta · D descanso · V vacaciones · I incapacidad.',
    cap: [JO, LB], rev: [RH], ver: [AD, DG],
    campos: [D('semana', 'Semana del', { req: 1 }), PERSONA('colaborador', 'Colaborador', { req: 1 })]
      .concat(DIASEM.map((k, i) => S(k, DIASL[i], ['A', 'R', 'F', 'D', 'V', 'I'])))
      .concat([C('asistencias', 'Asistencias', (d) => DIASEM.filter((k) => d[k] === 'A' || d[k] === 'R').length),
        C('retardos', 'Retardos', (d) => DIASEM.filter((k) => d[k] === 'R').length), C('faltas', 'Faltas', (d) => DIASEM.filter((k) => d[k] === 'F').length),
        A('obs', 'Observación')]) });

  mod({ clave: 'ld05_onboarding', libro: 'ld05', nombre: 'Plan de adaptación 30/60/90', tipo: 'tabla', frecuencia: 'A cada ingreso',
    ayuda: 'Un renglón por hito y persona. Una persona nueva no sale a barra sin capacitación mínima documentada.',
    cap: [JO], rev: [RH, DG], ver: [LB],
    campos: [PERSONA('colaborador', 'Colaborador', { req: 1 }), D('ingreso', 'Fecha de ingreso'),
      S('hito', 'Hito', ['Inducción: reglas, horarios, higiene y seguridad', 'Recorrido por cafetería y flujo de pedidos / POS', 'Capacitación en barra: espresso, leche, calidad',
        'Capacitación en caja y cierre', 'Evaluación de 30 días (reunión 1:1)', 'Dominio de recetas y estándar de tiempo', 'Evaluación de 60 días',
        'Evaluación de 90 días y decisión de continuidad'], { req: 1 }),
      T('responsable', 'Responsable'), D('objetivo', 'Fecha objetivo'), D('cumplido', 'Fecha cumplido'),
      C('estado', 'Estado', (d) => (d.cumplido ? 'Cumplido' : !d.objetivo ? '' : (d.objetivo < hoy() ? 'Vencido' : 'En plazo')), 'txt'), A('obs', 'Observación')] });

  const CAPS = [['espresso', 'Espresso / barra'], ['frias', 'Bebidas frías'], ['caja', 'Caja / POS'], ['cierre', 'Cierre y corte'], ['pan', 'Pan y vitrina'],
    ['recepcion', 'Recepción de mercancía'], ['inocuidad', 'Inocuidad']];
  mod({ clave: 'ld05_capacitacion', libro: 'ld05', nombre: 'Matriz de capacitación', tipo: 'tabla', frecuencia: 'Mensual',
    ayuda: 'Por persona: Capacitado, Pendiente o N/A en cada tema.',
    cap: [JO], rev: [RH, DG], ver: [LB],
    campos: [PERSONA('colaborador', 'Colaborador', { req: 1 })].concat(CAPS.map(([k, l]) => S(k, l, ['Capacitado', 'Pendiente', 'N/A'])))
      .concat([C('cobertura', 'Cobertura %', (d) => { const v = CAPS.map(([k]) => d[k]).filter((x) => x === 'Capacitado' || x === 'Pendiente');
        return v.length ? v.filter((x) => x === 'Capacitado').length / v.length : null; }, 'pct'), A('obs', 'Observación')]) });

  const EVAL = [['puntualidad', 'Puntualidad'], ['calidad', 'Calidad de producto'], ['velocidad', 'Velocidad de servicio'], ['trato', 'Trato al cliente'],
    ['orden', 'Orden y limpieza'], ['equipo', 'Trabajo en equipo']];
  mod({ clave: 'ld05_evaluacion', libro: 'ld05', nombre: 'Evaluación de desempeño', tipo: 'tabla', frecuencia: '30/60/90 y semestral',
    ayuda: 'Calificar de 1 a 5 con base en evidencia. Información confidencial.',
    cap: [JO], rev: [RH, DG], solo: [SA, DG, RH, JO],
    campos: [PERSONA('colaborador', 'Colaborador', { req: 1 }), S('periodo', 'Periodo', ['30 días', '60 días', '90 días', 'Semestral'], { req: 1 })]
      .concat(EVAL.map(([k, l]) => S(k, l, ['1', '2', '3', '4', '5'])))
      .concat([C('promedio', 'Promedio', (d) => { const v = EVAL.map(([k]) => n(d[k])).filter((x) => x !== null); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; }),
        A('fortalezas', 'Fortalezas'), A('mejorar', 'A mejorar')]) });

  mod({ clave: 'ld05_entrevista_salida', libro: 'ld05', nombre: 'Entrevista de salida', tipo: 'tabla', frecuencia: 'Cada baja',
    ayuda: 'Registrar cada baja con su causa. Información confidencial.',
    cap: [RH], rev: [DG], solo: [SA, DG, RH],
    campos: [T('colaborador', 'Colaborador', { req: 1 }), T('puesto', 'Puesto'), D('ingreso', 'Fecha de ingreso'), D('baja', 'Fecha de baja', { req: 1 }),
      C('antiguedad', 'Antigüedad (días)', (d) => dias(d.ingreso, d.baja)), S('tipo', 'Tipo de baja', ['Voluntaria', 'Involuntaria', 'Término de contrato', 'Abandono']),
      A('causa', 'Causa principal'), A('mejora', 'Qué haría mejor la empresa'), S('recontratable', 'Recontratable', SINO)] });

  mod({ clave: 'ld05_pendientes', libro: 'ld05', nombre: 'Tablero de pendientes', tipo: 'tabla', frecuencia: 'Continuo',
    ayuda: 'Fuente única de pendientes con fecha compromiso; sustituye los pendientes dispersos en chats.',
    cap: [JO, LB, BA, CA, CH, EC, AD, AC, RH], rev: [JO, AD, DG], ver: [],
    campos: [A('pendiente', 'Pendiente', { req: 1 }), T('area', 'Área'), T('responsable', 'Responsable', { req: 1 }), S('prioridad', 'Prioridad', ['Alta', 'Media', 'Baja']),
      D('compromiso', 'Fecha compromiso', { req: 1 }), S('estatus', 'Estatus', ['Abierto', 'En proceso', 'Cerrado'], { req: 1 }),
      C('retraso', 'Días de retraso', (d) => (!d.compromiso || d.estatus === 'Cerrado' ? null : Math.max(dias(d.compromiso, hoy()), 0))), D('cierre', 'Fecha de cierre'), A('nota', 'Nota')] });

  mod({ clave: 'ld05_acta_reunion', libro: 'ld05', nombre: 'Acta de reunión semanal', tipo: 'tabla', frecuencia: 'Semanal',
    ayuda: 'Agenda fija: KPIs de la semana, pendientes vencidos y acuerdos.',
    cap: [JO], rev: [DG, AD], ver: [LB, EC, CA, RH],
    campos: [A('asistentes', 'Asistentes'), T('tema', 'Tema', { req: 1 }), A('acuerdo', 'Acuerdo / decisión', { req: 1 }), T('responsable', 'Responsable'), D('compromiso', 'Fecha compromiso'),
      S('paso_tablero', 'Pasó al tablero', SINO)] });

  mod({ clave: 'ld05_kpi_semanal', libro: 'ld05', nombre: 'Tablero semanal de KPIs', tipo: 'tabla', frecuencia: 'Semanal (viernes)',
    ayuda: 'Capturar el viernes. Las ventas vienen del POS.',
    cap: [JO], rev: [DG, AD], ver: [LB, AC],
    campos: [D('semana', 'Semana (inicio)', { req: 1 }), M('ventas', 'Ventas $'), N('tickets', 'Tickets'),
      C('ticket_prom', 'Ticket promedio', (d) => (!n(d.tickets) || n(d.ventas) === null ? null : r2(n(d.ventas) / n(d.tickets))), 'dinero'),
      N('merma_pan', 'Merma pan (pzas)'), N('tiempo_bebida', 'Tiempo prom. bebida (seg)'), N('faltantes', 'Faltantes de insumo (veces)'), N('quejas', 'Quejas'),
      N('faltas', 'Faltas / retardos'), A('obs', 'Observación')] });

  // =========================== LD-06 · Organización, Puestos y RACI ===========================
  const ESTR = { cap: [SA, RH], rev: [DG], ver: [JO, AD] };
  mod(Object.assign({ clave: 'ld06_parametros', libro: 'ld06', nombre: 'Parámetros de dimensionamiento', tipo: 'unico', frecuencia: 'Recalcular con rol real',
    ayuda: 'Alimentan el dimensionamiento de barra.',
    campos: [N('horas_sem', 'Horas de apertura al público por semana'), N('pers_turno', 'Personas de barra por turno requeridas'), N('turnos_dia_lv', 'Turnos por día L–V'),
      N('turnos_dia_fds', 'Turnos por día S–D'), N('dias_pago', 'Días pagados por barista por semana'), N('baristas', 'Baristas activos')] }, ESTR));
  mod(Object.assign({ clave: 'ld06_org_actual', libro: 'ld06', nombre: 'Organigrama actual', tipo: 'tabla', frecuencia: 'Con cada cambio',
    ayuda: 'Cada fila es una persona o puesto.',
    campos: [N('nivel', 'Nivel'), T('persona', 'Persona', { req: 1 }), T('puesto_nomina', 'Puesto en nómina'), A('funcion', 'Función real observada'), T('reporta', 'Reporta a'),
      T('ubicacion', 'Ubicación'), A('obs', 'Observación')] }, ESTR));
  mod(Object.assign({ clave: 'ld06_org_propuesto', libro: 'ld06', nombre: 'Organigrama propuesto', tipo: 'tabla', frecuencia: 'Hasta aprobar',
    ayuda: 'Un solo jefe por persona. "Personas a cargo" se calcula contando quién reporta a cada puesto.',
    campos: [N('nivel', 'Nivel'), T('puesto', 'Puesto', { req: 1 }), T('titular', 'Titular propuesto'), T('reporta', 'Reporta a'), T('punteada', 'Línea punteada a'),
      C('a_cargo', 'Personas a cargo', (d, c) => c.filas.filter((x) => x.datos.reporta && x.datos.reporta === d.puesto).length),
      S('estatus', 'Estatus', ['Existe', 'Redefinido', 'NUEVO', 'A contratar', 'Promoción']), A('cambio', 'Qué cambia vs hoy')] }, ESTR));
  mod(Object.assign({ clave: 'ld06_puestos', libro: 'ld06', nombre: 'Descripción de puestos', tipo: 'tabla', frecuencia: 'Hasta validar',
    ayuda: 'Propósito, funciones medibles, KPI y límites de decisión de cada puesto.',
    campos: [T('puesto', 'Puesto', { req: 1 }), A('proposito', 'Propósito'), A('funciones', 'Funciones clave (medibles)'), A('kpi', 'Indicador (KPI)'), A('decide', 'Decide'),
      A('escala', 'Escala (no decide)'), T('reemplaza', 'Reemplaza al perfil'), S('estatus', 'Estatus', ['Vigente', 'Redefinido', 'NUEVO', 'Decisión pendiente'])] }, ESTR));
  const RACI_COLS = [['direccion', 'Dirección'], ['admin', 'Administrador'], ['contab', 'Analista contable'], ['rh', 'RR.HH.'], ['jefe_op', 'Jefe de Operaciones'],
    ['lider_barra', 'Líder de barra'], ['barista', 'Barista'], ['cocina', 'Encargado de cocina'], ['compras', 'Comprador-almacenista'], ['chofer', 'Chofer']];
  mod(Object.assign({ clave: 'ld06_raci', libro: 'ld06', nombre: 'Matriz RACI', tipo: 'tabla', frecuencia: 'Hasta aprobar',
    ayuda: 'R ejecuta · A responde (uno solo por proceso) · C se consulta · I se informa.',
    campos: [T('proceso', 'Proceso', { req: 1 })].concat(RACI_COLS.map(([k, l]) => S(k, l, ['R', 'A', 'A/R', 'C', 'I', '—'])))
      .concat([C('num_a', "# de 'A'", (d) => RACI_COLS.filter(([k]) => d[k] === 'A' || d[k] === 'A/R').length),
        C('valido', 'Válido', (d) => (RACI_COLS.filter(([k]) => d[k] === 'A' || d[k] === 'A/R').length === 1 ? 'Sí' : 'No: debe haber exactamente una A'), 'txt'),
        S('estatus', 'Estatus', ['PROPUESTA', 'Aprobado'])]) }, ESTR));
  mod(Object.assign({ clave: 'ld06_decisiones', libro: 'ld06', nombre: 'Decisiones abiertas', tipo: 'tabla', frecuencia: 'Semanal',
    ayuda: 'Lo que bloquea la versión final de la estructura.',
    campos: [A('pendiente', 'Pendiente', { req: 1 }), T('decide', 'Quién decide / aporta'), A('importa', 'Por qué importa'), D('compromiso', 'Fecha compromiso'),
      S('estatus', 'Estatus', ['Abierto', 'En proceso', 'Cerrado'], { req: 1 })] }, ESTR));

  // =========================== LD-07 · Procesos, KPIs, Plan y Riesgos ===========================
  const GEST = { cap: [SA, JO], rev: [DG], ver: [AD, RH] };
  mod(Object.assign({ clave: 'ld07_parametros', libro: 'ld07', nombre: 'Parámetros', tipo: 'unico', frecuencia: 'Se define una vez',
    ayuda: 'Fecha de inicio del plan de implementación.', campos: [D('fecha_ini', 'Fecha de inicio del plan')] }, GEST));
  mod(Object.assign({ clave: 'ld07_mapa_procesos', libro: 'ld07', nombre: 'Mapa de procesos', tipo: 'tabla', frecuencia: 'Tras cada hito',
    ayuda: 'Cada proceso con su dueño actual, dueño propuesto y brecha.',
    campos: [T('id', 'ID', { req: 1 }), T('proceso', 'Proceso', { req: 1 }), S('tipo', 'Tipo', ['Estratégico', 'Operativo', 'Soporte']), T('dueno_actual', 'Dueño actual'),
      T('dueno_propuesto', 'Dueño propuesto'), S('estado', 'Estado actual', ['Inexistente', 'Informal', 'Parcial', 'Formal']), T('evidencia', 'Evidencia'),
      T('formato', 'Formato que lo controla'), A('brecha', 'Brecha principal'), S('prioridad', 'Prioridad', ['Alta', 'Media', 'Baja'])] }, GEST));
  mod(Object.assign({ clave: 'ld07_flujos', libro: 'ld07', nombre: 'Flujos actual vs futuro', tipo: 'tabla', frecuencia: 'Hasta aprobar',
    ayuda: 'Cada paso con actor actual, práctica observada y cómo debe hacerse.',
    campos: [T('flujo', 'Flujo', { req: 1 }), N('paso', 'Paso'), T('actividad', 'Actividad', { req: 1 }), T('actor_actual', 'Actor actual'), A('hoy', 'Cómo se hace hoy'),
      T('actor_propuesto', 'Actor propuesto'), A('debe', 'Cómo debe hacerse'), T('formato', 'Formato / control'), T('tiempo', 'Tiempo objetivo')] }, GEST));
  mod(Object.assign({ clave: 'ld07_kpis', libro: 'ld07', nombre: 'Tablero de KPIs', tipo: 'tabla', frecuencia: 'Revisión mensual',
    ayuda: 'Catálogo de indicadores con fórmula, fuente, responsable, línea base y meta.',
    campos: [T('id', 'ID', { req: 1 }), T('area', 'Área'), T('kpi', 'KPI', { req: 1 }), A('formula', 'Fórmula'), T('fuente', 'Fuente del dato'),
      S('frecuencia', 'Frecuencia', ['Diaria', 'Semanal', 'Mensual', 'Trimestral']), T('responsable', 'Responsable'), T('linea_base', 'Línea base'), T('meta', 'Meta'),
      S('estatus', 'Estatus de la meta', ['Dato real', 'Propuesta', 'Pendiente'])] }, GEST));
  mod(Object.assign({ clave: 'ld07_plan', libro: 'ld07', nombre: 'Plan de implementación 30/60/90', tipo: 'tabla', frecuencia: 'Revisión semanal',
    ayuda: 'Cada acción con responsable, entregable y avance. La fecha objetivo se calcula con la fecha de inicio de Parámetros.',
    campos: [S('horizonte', 'Horizonte', ['0–30 días', '31–60 días', '61–90 días', '90+ días'], { req: 1 }), A('accion', 'Acción', { req: 1 }), T('hallazgo', 'Hallazgo'),
      T('responsable', 'Responsable'), A('entregable', 'Entregable'), T('dependencia', 'Dependencia'), S('esfuerzo', 'Esfuerzo', ['Baja', 'Media', 'Alta']),
      S('impacto', 'Impacto', ['Crítico', 'Alto', 'Medio', 'Bajo']),
      C('fecha_obj', 'Fecha objetivo', (d, c) => { if (!c.params.fecha_ini || !d.horizonte) return ''; const add = { '0–30 días': 30, '31–60 días': 60, '61–90 días': 90 }[d.horizonte] || 180;
        const t = new Date(c.params.fecha_ini + 'T00:00:00'); t.setDate(t.getDate() + add); return t.toISOString().slice(0, 10); }, 'txt'),
      S('estatus', 'Estatus', ['Pendiente', 'En proceso', 'Hecho', 'Bloqueado']), N('avance', 'Avance %')] }, GEST));
  mod(Object.assign({ clave: 'ld07_riesgos', libro: 'ld07', nombre: 'Matriz de riesgos', tipo: 'tabla', frecuencia: 'Mensual',
    ayuda: 'Puntuación = probabilidad × impacto. ≥15 Alto, ≥9 Medio, resto Bajo.',
    campos: [T('id', 'ID', { req: 1 }), A('riesgo', 'Riesgo', { req: 1 }), T('hallazgo', 'Hallazgo'), S('prob', 'Probabilidad (1-5)', ['1', '2', '3', '4', '5'], { req: 1 }),
      S('impacto', 'Impacto (1-5)', ['1', '2', '3', '4', '5'], { req: 1 }),
      C('puntos', 'Puntuación', (d) => (n(d.prob) === null || n(d.impacto) === null ? null : n(d.prob) * n(d.impacto))),
      C('nivel', 'Nivel', (d) => { const p = n(d.prob) * n(d.impacto); return !n(d.prob) || !n(d.impacto) ? '' : p >= 15 ? 'Alto' : p >= 9 ? 'Medio' : 'Bajo'; }, 'txt'),
      A('mitigacion', 'Mitigación'), T('dueno', 'Dueño')] }, GEST));
  mod(Object.assign({ clave: 'ld07_hallazgos', libro: 'ld07', nombre: 'Matriz de hallazgos', tipo: 'tabla', frecuencia: 'Actualizar',
    ayuda: 'Índice para trazar cada hallazgo hasta su acción.',
    campos: [T('id', 'H#', { req: 1 }), A('hallazgo', 'Hallazgo', { req: 1 }), S('severidad', 'Severidad', ['Crítica', 'Alta', 'Media-alta', 'Media', 'Baja']), T('area', 'Área'),
      A('accion', 'Acción asociada'), S('horizonte', 'Horizonte (días)', ['0–30', '31–60', '61–90', '90+'])] }, GEST));
  const CONF = { cap: [RH, SA], rev: [DG], solo: [SA, DG, RH] };
  mod(Object.assign({ clave: 'ld07_compensacion', libro: 'ld07', nombre: 'Compensación vs referencia', tipo: 'tabla', frecuencia: 'Hasta contar con estudio salarial',
    ayuda: 'CONFIDENCIAL. Nómina real contra referencia de mercado; solo orientativo.',
    campos: [T('puesto', 'Puesto', { req: 1 }), N('personas', 'Personas'), M('diario_fiscal', 'Salario diario fiscal'), M('diario_real', 'Salario diario real'),
      C('mensual_real', 'Mensual real (×30.4167)', (d) => (n(d.diario_real) === null ? null : r2(n(d.diario_real) * 30.4167)), 'dinero'),
      M('referencia', 'Referencia de mercado mensual'), T('fuente', 'Fuente de la referencia'),
      C('real_ref', 'Real / referencia', (d) => (!n(d.referencia) || n(d.diario_real) === null ? null : n(d.diario_real) * 30.4167 / n(d.referencia)), 'pct'),
      C('fuera_fiscal', '% del real fuera de lo fiscal', (d) => (!n(d.diario_real) || n(d.diario_fiscal) === null ? null : (n(d.diario_real) - n(d.diario_fiscal)) / n(d.diario_real)), 'pct'),
      C('lectura', 'Lectura', (d) => { if (!n(d.referencia) || n(d.diario_real) === null) return 'Sin referencia'; const h = n(d.diario_real) * 30.4167 / n(d.referencia);
        return h > 1.2 ? 'Por encima de la referencia' : h < 0.9 ? 'Por debajo de la referencia' : 'Similar a la referencia'; }, 'txt')] }, CONF));
  mod(Object.assign({ clave: 'ld07_prestaciones', libro: 'ld07', nombre: 'Prestaciones · revisión', tipo: 'tabla', frecuencia: 'En la sesión de revisión',
    ayuda: 'CONFIDENCIAL. Lo que se sabe y lo que falta validar de prestaciones.',
    campos: [T('concepto', 'Concepto', { req: 1 }), S('consta', '¿Consta?', ['Sí', 'No', 'Sin dato']), A('dato', 'Dato conocido'), T('fuente', 'Fuente'), A('pregunta', 'Pregunta para RR.HH.'),
      S('estatus', 'Estatus', ['Pendiente', 'Por validar', 'Validado', 'Crítico'])] }, CONF));

  // =========================== LD-08 · Ventas y Punto de Equilibrio ===========================
  const VTA = { cap: [AD, JO, SA], rev: [DG, AD], ver: [AC] };
  mod({ clave: 'ld08_parametros', libro: 'ld08', nombre: 'Parámetros', tipo: 'unico', frecuencia: 'Mensual',
    ayuda: 'Supuestos del punto de equilibrio real. Confidencial.',
    cap: [AD, SA], rev: [DG], solo: [SA, DG, AD, AC],
    campos: [P('fc', 'Food cost ponderado (costo de venta / venta)'), M('nomina', 'Nómina real mensual con cargas ($)'), M('otros_suc', 'Fijos de sucursal sin nómina ($/mes)'),
      M('central', 'Central sin nómina ($/mes)'), M('corp', 'Gastos corporativos ($/mes)'), N('dias_mes', 'Días del mes para pasar a tickets/día'),
      N('pers_turno', 'Personas por turno en barra'), N('gatillo', 'Gatillo de tickets/día para abrir la siguiente sucursal'), M('costo_hora', 'Costo real por hora de un barista ($)'),
      D('apertura', 'Fecha de apertura (primer día operativo)')] });
  mod(Object.assign({ clave: 'ld08_ventas_diarias', libro: 'ld08', nombre: 'Ventas diarias', tipo: 'tabla', frecuencia: 'Semanal, con el reporte del POS',
    ayuda: 'Un renglón por día, con los datos del reporte del POS. La "fecha" del registro es el día de venta.',
    campos: [M('venta_neta', 'Venta neta', { req: 1 }), N('cuentas', 'Cuentas (tickets)', { req: 1 }), M('total_iva', 'Total con IVA'), M('propina', 'Propina en POS'),
      M('efectivo_pos', 'Efectivo según el POS'), M('efectivo_manual', 'Efectivo según la hoja manual'),
      C('ticket', 'Ticket neto', (d) => (!n(d.cuentas) ? null : r2(n(d.venta_neta) / n(d.cuentas))), 'dinero'),
      C('dif_manual', 'Hoja manual − POS', (d) => (n(d.efectivo_manual) === null || n(d.efectivo_pos) === null ? null : r2(n(d.efectivo_manual) - n(d.efectivo_pos))), 'dinero'),
      A('obs', 'Observación')] }, VTA));
  mod(Object.assign({ clave: 'ld08_mezcla_mensual', libro: 'ld08', nombre: 'Mezcla mensual', tipo: 'tabla', frecuencia: 'Mensual',
    ayuda: 'Alimentos, bebidas, otros, cortesías y descuentos del mes (reporte del POS).',
    campos: [{ k: 'mes', l: 'Mes', t: 'mes', req: 1 }, M('alimentos', 'Alimentos'), M('bebidas', 'Bebidas'), M('otros', 'Otros'), M('cortesias', 'Cortesías'),
      M('descuentos', 'Descuentos'),
      C('pct_bebidas', '% bebidas', (d) => { const t = (n(d.alimentos) || 0) + (n(d.bebidas) || 0) + (n(d.otros) || 0); return !t ? null : (n(d.bebidas) || 0) / t; }, 'pct'),
      C('pct_cort', '% cortesías + descuentos', (d) => { const t = (n(d.alimentos) || 0) + (n(d.bebidas) || 0) + (n(d.otros) || 0); return !t ? null : ((n(d.cortesias) || 0) + (n(d.descuentos) || 0)) / t; }, 'pct')] }, VTA));
  mod({ clave: 'ld08_efectivo_entregas', libro: 'ld08', nombre: 'Entregas de efectivo', tipo: 'tabla', frecuencia: 'Cada entrega',
    ayuda: 'Efectivo entregado a Administración. Se concilia contra el efectivo del POS. Quien entrega y quien recibe son personas distintas.',
    cap: [JO, LB], rev: [AD, DG], ver: [AC],
    campos: [M('monto', 'Monto entregado', { req: 1 }), T('periodo', 'Periodo que cubre'), A('obs', 'Observación')],
    revision: [M('monto_recibido', 'Monto recibido y contado'),
      C('dif', 'Diferencia', (d, c, rv) => (n(rv.monto_recibido) === null ? null : r2(n(rv.monto_recibido) - (n(d.monto) || 0))), 'dinero'), A('nota', 'Nota de quien recibe')] });
  mod(Object.assign({ clave: 'ld08_ventas_hora', libro: 'ld08', nombre: 'Ventas por hora', tipo: 'tabla', frecuencia: 'Mensual',
    ayuda: 'Del reporte "Ventas por hora" del POS, por periodo.',
    campos: [T('periodo', 'Periodo', { req: 1 }), S('hora', 'Hora', Array.from({ length: 16 }, (_, i) => String(i + 6).padStart(2, '0') + ':00'), { req: 1 }), N('tickets', 'Tickets', { req: 1 }),
      M('venta', 'Venta neta'), M('descuentos', 'Descuentos'),
      C('ticket', 'Ticket promedio', (d) => (!n(d.tickets) ? null : r2((n(d.venta) || 0) / n(d.tickets))), 'dinero'),
      C('pct', '% de los tickets del periodo', (d, c) => { const t = c.filas.filter((x) => x.datos.periodo === d.periodo).reduce((a, x) => a + (n(x.datos.tickets) || 0), 0); return !t ? null : (n(d.tickets) || 0) / t; }, 'pct')] }, VTA));
  mod(Object.assign({ clave: 'ld08_productos_top', libro: 'ld08', nombre: 'Productos más vendidos', tipo: 'tabla', frecuencia: 'Mensual',
    ayuda: 'Del reporte "Popularidad por productos" del POS.',
    campos: [T('periodo', 'Periodo', { req: 1 }), T('producto', 'Producto', { req: 1 }), N('unidades', 'Unidades', { req: 1 }), M('venta_iva', 'Venta con IVA'),
      C('precio_prom', 'Precio promedio', (d) => (!n(d.unidades) ? null : r2((n(d.venta_iva) || 0) / n(d.unidades))), 'dinero'), S('origen', 'Origen', ['Barra', 'Cocina', 'Proveedor'])] }, VTA));
  mod(Object.assign({ clave: 'ld08_control_pos', libro: 'ld08', nombre: 'Controles del POS', tipo: 'tabla', frecuencia: 'Mensual',
    ayuda: 'Lo que muestran los reportes del POS sobre usuarios, cancelaciones, descuentos y cortesías.',
    campos: [T('control', 'Control', { req: 1 }), A('dato', 'Dato del periodo'), A('significa', 'Qué significa'), S('riesgo', 'Riesgo', ['Alta', 'Media', 'Baja']), A('accion', 'Acción propuesta')] }, VTA));
  mod(Object.assign({ clave: 'ld08_calidad_datos', libro: 'ld08', nombre: 'Calidad de datos', tipo: 'tabla', frecuencia: 'Hasta cerrar',
    ayuda: 'Problemas encontrados al cargar reportes de ventas y caja.',
    campos: [T('id', 'ID', { req: 1 }), A('hallazgo', 'Hallazgo', { req: 1 }), A('efecto', 'Efecto'), A('correccion', 'Corrección propuesta'), S('prioridad', 'Prioridad', ['Alta', 'Media', 'Baja']),
      S('estatus', 'Estatus', ['Abierto', 'Cerrado'])] }, VTA));

  // =========================== F2 · Modelo de Costos ===========================
  const COSTO_VER = [JO, EC, AC];
  mod({ clave: 'f2_parametros', libro: 'f2', nombre: 'Parámetros de costos', tipo: 'unico', frecuencia: 'Cuando cambien los supuestos',
    ayuda: '% indirecto objetivo y supuestos de operación de una sucursal (alimentan KPIs y tablero de costos).',
    cap: [AD, SA], rev: [DG], ver: COSTO_VER,
    campos: [P('pct_indirecto', '% indirecto objetivo'), P('food_cost_obj', 'Food cost objetivo para proyección (%)'), N('trans_dia', 'Transacciones por día objetivo'),
      N('dias_mes', 'Días operativos por mes'), M('renta', 'Renta mensual sucursal'), M('nomina', 'Nómina mensual sucursal'), M('servicios', 'Servicios mensuales'),
      M('marketing', 'Marketing prorrateo mensual'), M('otros', 'Otros gastos fijos')] });
  mod({ clave: 'f2_insumos', libro: 'f2', nombre: 'Insumos', tipo: 'tabla', frecuencia: 'Cada cambio de precio', catalogo: ['codigo', 'insumo', 'categoria', 'unidad_compra', 'unidad_uso'],
    ayuda: 'Catálogo de insumos con precio de compra. El costo por unidad de uso se calcula solo y alimenta las recetas. Un cambio de precio se captura como corrección o nuevo registro; el historial queda en la bitácora.',
    cap: [CA, AD], rev: [AD, DG, JO], ver: COSTO_VER,
    campos: [T('codigo', 'Código', { req: 1 }), T('categoria', 'Categoría', { req: 1 }), T('insumo', 'Insumo', { req: 1 }), T('proveedor', 'Proveedor'), T('unidad_compra', 'Unidad de compra', { req: 1 }),
      M('precio', 'Precio unitario', { req: 1 }), T('unidad_uso', 'Unidad de uso', { req: 1 }), N('factor', 'Factor de conversión (unidades de uso por unidad de compra)', { req: 1 }),
      C('costo_uso', 'Costo por unidad de uso', (d) => (!n(d.factor) || n(d.precio) === null ? null : n(d.precio) / n(d.factor)), 'dinero4'),
      S('estatus', 'Estatus', ['Real', 'Cotizado', 'Estimado', 'Pendiente']), A('nota', 'Nota')] });
  mod({ clave: 'f2_recetas', libro: 'f2', nombre: 'Recetas y costeo', tipo: 'tabla', frecuencia: 'Cada cambio de receta', catalogo: ['receta_id', 'receta', 'tipo'],
    ayuda: 'Receta con sus componentes. El costo se calcula con el costo vigente de cada insumo; un aderezo o sub-receta entra por su costo por porción.',
    cap: [EC, AD], rev: [DG, AD, JO], ver: COSTO_VER.concat([CA]),
    campos: [T('receta_id', 'ID de receta', { req: 1 }), T('receta', 'Receta', { req: 1 }), S('tipo', 'Tipo', ['Producto', 'Aderezo / sub-receta'], { req: 1 }),
      N('rendimiento', 'Rendimiento (porciones)'), P('merma', 'Merma %'), M('precio_sugerido', 'Precio de venta sugerido'),
      L('componentes', 'Componentes', [S('tipo', 'Tipo', ['Insumo', 'Sub-receta']), T('componente', 'Componente (nombre exacto del insumo o ID de sub-receta)'), N('cantidad', 'Cantidad'), T('unidad', 'Unidad')],
        { calcLinea: { l: 'Costo línea', fmt: 'dinero', fn: (ln, d, c) => c.costos ? c.costos.linea(ln) : null } }),
      C('costo_materia', 'Costo materia', (d, c) => (c.costos ? c.costos.receta(d).materia : null), 'dinero'),
      C('costo_merma', 'Costo con merma', (d, c) => (c.costos ? c.costos.receta(d).conMerma : null), 'dinero'),
      C('costo_porcion', 'Costo por porción', (d, c) => (c.costos ? c.costos.receta(d).porcion : null), 'dinero'),
      C('food_cost', 'Food cost %', (d, c) => { if (!c.costos || !n(d.precio_sugerido)) return null; const k = c.costos.receta(d).porcion; return k === null ? null : k / n(d.precio_sugerido); }, 'pct'),
      C('estado', 'Estado', (d, c) => { if (!c.costos || !n(d.precio_sugerido)) return ''; const k = c.costos.receta(d).porcion; return k === null ? 'Faltan costos' : estadoFC(k / n(d.precio_sugerido)); }, 'txt'),
      A('nota', 'Nota')] });
  mod({ clave: 'f2_menu', libro: 'f2', nombre: 'Menú y precios', tipo: 'tabla', frecuencia: 'Cada cambio de precio o de menú', catalogo: ['sku', 'producto', 'categoria'],
    ayuda: 'Cada producto del menú ligado a su receta. Los precios de venta los captura Administración y los revisa Dirección.',
    cap: [AD], rev: [DG], ver: COSTO_VER,
    campos: [T('sku', 'SKU', { req: 1 }), T('categoria', 'Categoría', { req: 1 }), T('producto', 'Producto', { req: 1 }), T('receta_id', 'ID de receta'), M('precio', 'Precio de venta', { req: 1 }),
      P('mix', 'Mix % esperado'), M('empaque', 'Costo de empaque $'),
      C('costo', 'Costo receta', (d, c) => (c.costos ? c.costos.menu(d).costo : null), 'dinero'),
      C('margen', 'Margen $', (d, c) => (c.costos ? c.costos.menu(d).margen : null), 'dinero'),
      C('fc', 'Food cost %', (d, c) => (c.costos ? c.costos.menu(d).fc : null), 'pct'),
      C('estado', 'Estado', (d, c) => (c.costos ? estadoFC(c.costos.menu(d).fc) : ''), 'txt'),
      C('costo_total', 'Costo total (receta + empaque + indirecto)', (d, c) => (c.costos ? c.costos.menu(d).costoTotal : null), 'dinero'),
      C('margen_real', 'Margen real %', (d, c) => (c.costos ? c.costos.menu(d).margenRealPct : null), 'pct'),
      C('estado_real', 'Estado real', (d, c) => { const m = c.costos ? c.costos.menu(d).margenRealPct : null; return m === null ? '' : m >= 0.35 ? 'Excelente' : m >= 0.25 ? 'Aceptable' : m >= 0.15 ? 'Ajustado' : 'Crítico'; }, 'txt')] });
  mod({ clave: 'f2_promociones', libro: 'f2', nombre: 'Promociones', tipo: 'tabla', frecuencia: 'Cada promoción',
    ayuda: 'Combos armados con productos del menú. Costo, descuento y margen se calculan solos.',
    cap: [AD, JO], rev: [DG], ver: COSTO_VER,
    campos: [T('promo_id', 'ID', { req: 1 }), T('nombre', 'Nombre', { req: 1 }), M('pv_combo', 'Precio del combo', { req: 1 }),
      L('items', 'Productos del combo', [T('sku', 'SKU del menú'), N('cantidad', 'Cantidad')]),
      C('costo', 'Costo combo', (d, c) => (c.costos ? c.costos.promo(d).costo : null), 'dinero'),
      C('pv_ind', 'Suma de precios individuales', (d, c) => (c.costos ? c.costos.promo(d).pvInd : null), 'dinero'),
      C('desc', 'Descuento %', (d, c) => (c.costos ? c.costos.promo(d).descPct : null), 'pct'),
      C('margen', 'Margen %', (d, c) => (c.costos ? c.costos.promo(d).margenPct : null), 'pct'),
      C('estado', 'Estado', (d, c) => { const m = c.costos ? c.costos.promo(d).margenPct : null; return m === null ? '' : m >= 0.6 ? 'Excelente' : m >= 0.5 ? 'Aceptable' : m >= 0.4 ? 'Bajo' : 'Revisar'; }, 'txt')] });
  mod({ clave: 'f2_paquetes', libro: 'f2', nombre: 'Paquetes', tipo: 'tabla', frecuencia: 'Cada paquete',
    ayuda: 'Paquetes para oficina, eventos o catering.',
    cap: [AD, JO], rev: [DG], ver: COSTO_VER,
    campos: [T('paquete_id', 'ID', { req: 1 }), T('nombre', 'Nombre', { req: 1 }), A('descripcion', 'Descripción'), A('items', 'Productos incluidos'), M('costo', 'Costo total', { req: 1 }),
      M('pv', 'Precio del paquete', { req: 1 }), C('margen', 'Margen $', (d) => (n(d.pv) === null || n(d.costo) === null ? null : r2(n(d.pv) - n(d.costo))), 'dinero'),
      C('margen_pct', 'Margen %', (d) => (!n(d.pv) || n(d.costo) === null ? null : (n(d.pv) - n(d.costo)) / n(d.pv)), 'pct'), N('minimo', 'Mín. unidades'), A('notas', 'Notas')] });
  mod({ clave: 'f2_pesos_rebanada', libro: 'f2', nombre: 'Peso promedio por rebanada', tipo: 'tabla', frecuencia: 'Cuando se mida',
    ayuda: 'Referencia de pesos para estandarizar porciones de embutidos y quesos.',
    cap: [EC], rev: [JO, AD], ver: COSTO_VER.concat([LB, BA]),
    campos: [T('tipo', 'Tipo de producto', { req: 1 }), N('peso_min', 'Peso mínimo (g)'), N('peso_max', 'Peso máximo (g)'), A('nota', 'Nota')] });
  mod({ clave: 'f2_operacion_diaria', libro: 'f2', nombre: 'Operación diaria · producción vs venta', tipo: 'tabla', frecuencia: 'Diario',
    ayuda: 'Producido, vendido y descuentos por producto y sucursal.',
    cap: [LB, BA], rev: [JO], ver: [AD, AC, EC],
    campos: [PRODUCTO('producto', 'Producto', { req: 1 }), M('pvp', 'Precio de venta'), N('producido', 'Producido', { req: 1 }), N('vendido', 'Vendido', { req: 1 }), N('descuento', 'Descuentos / cortesías'),
      C('merma', 'Merma', (d) => (n(d.producido) === null || n(d.vendido) === null ? null : n(d.producido) - n(d.vendido))),
      C('pct_merma', '% merma', (d) => (!n(d.producido) ? null : (n(d.producido) - (n(d.vendido) || 0)) / n(d.producido)), 'pct'),
      C('ingreso', 'Ingreso $', (d) => (n(d.vendido) === null || n(d.pvp) === null ? null : r2(n(d.vendido) * n(d.pvp))), 'dinero')] });

  // =========================== F3 · Modelo Financiero ===========================
  const FIN = { cap: [AD, SA], rev: [DG], solo: [SA, DG, AD, AC] };
  mod(Object.assign({ clave: 'f3_supuestos', libro: 'f3', nombre: 'Supuestos', tipo: 'unico', frecuencia: 'Cuando cambien los supuestos',
    ayuda: 'Todo el modelo financiero (P&L, flujo, punto de equilibrio, escenarios y sensibilidad) se recalcula con estos valores. Cada versión queda guardada.',
    campos: [
      { t: 'seccion', l: 'Operación por sucursal (madura)' }, N('S_trans_dia', 'Transacciones por día'), M('S_ticket', 'Ticket promedio'), N('S_dias_mes', 'Días operativos por mes'), P('S_food_cost', 'Food cost ponderado (escenario base)'),
      { t: 'seccion', l: 'Rampa de ventas (% de la capacidad madura por mes desde la apertura)' }, P('R_mes_1', 'Mes 1'), P('R_mes_2', 'Mes 2'), P('R_mes_3', 'Mes 3'), P('R_mes_4', 'Mes 4'), P('R_mes_5', 'Mes 5'), P('R_mes_6mas', 'Mes 6 en adelante'),
      { t: 'seccion', l: 'Gastos fijos por sucursal (mensuales)' }, M('G_renta', 'Renta'), M('G_nomina', 'Nómina'), M('G_servicios', 'Servicios'), M('G_mkt_pror', 'Marketing prorrateado'), M('G_otros', 'Otros fijos'),
      { t: 'seccion', l: 'Producción central (compartida)' }, M('C_nomina', 'Nómina cocina central'), M('C_renta', 'Renta cocina / oficina central'), M('C_servicios', 'Servicios central'), M('C_transporte', 'Transporte / logística'),
      { t: 'seccion', l: 'Gastos corporativos (compartidos)' }, M('X_admin', 'Dirección + Administración'), M('X_mkt_core', 'Marketing'), M('X_pauta', 'Pauta publicitaria'), M('X_pos', 'Sistema POS'), M('X_contador', 'Contador'), M('X_otros', 'Otros corporativos'),
      { t: 'seccion', l: 'Cronograma de apertura (mes desde el inicio del modelo)' }, N('Apertura_Suc1', 'Mes de apertura sucursal 1'), N('Apertura_Suc2', 'Mes de apertura sucursal 2'), N('Apertura_Suc3', 'Mes de apertura sucursal 3'),
      { t: 'seccion', l: 'Escenarios' }, S('Escenario', 'Escenario activo', ['Pesimista', 'Base', 'Optimista']),
      N('F_ventas_pes', 'Factor de ventas · pesimista'), N('F_ventas_opt', 'Factor de ventas · optimista'), P('FC_pes', 'Food cost · pesimista'), P('FC_opt', 'Food cost · optimista'),
      M('T_ticket_pes', 'Ticket promedio · pesimista'), M('T_ticket_opt', 'Ticket promedio · optimista')] }, FIN));
  mod(Object.assign({ clave: 'f3_capex', libro: 'f3', nombre: 'CAPEX · inversión inicial', tipo: 'tabla', frecuencia: 'Cada concepto de inversión',
    ayuda: 'Un renglón por concepto. "Por sucursal" se repite en cada apertura; "Compartido" se invierte una sola vez; "Hundido" ya fue pagado y no requiere desembolso.',
    campos: [T('concepto', 'Concepto', { req: 1 }), S('tipo', 'Tipo', ['Por sucursal', 'Compartido', 'Hundido'], { req: 1 }), M('monto', 'Monto', { req: 1 }), A('notas', 'Notas')] }, FIN));

  // ---- Vistas calculadas (solo lectura). ver: roles con acceso; fuentes: módulos que leen. ----
  const VISTAS = [
    { clave: 'v_inv_conciliacion', libro: 'ld01', nombre: 'Inventario general · conciliación', fuentes: ['ld01_inv_conteos', 'ld01_parametros'], ver: [SA, DG, AD, JO, CA, AC] },
    { clave: 'v_fondo_saldo', libro: 'ld01', nombre: 'Fondo de efectivo · saldo', fuentes: ['ld01_fondo_efectivo'], ver: [SA, DG, AD, AC, JO, CA] },
    { clave: 'v_dimensionamiento', libro: 'ld06', nombre: 'Dimensionamiento de barra', fuentes: ['ld06_parametros'], ver: [SA, DG, RH, JO, AD] },
    { clave: 'v_ventas_resumen', libro: 'ld08', nombre: 'Resumen mensual, patrón y tendencia', fuentes: ['ld08_ventas_diarias', 'ld08_mezcla_mensual'], ver: [SA, DG, AD, JO, AC] },
    { clave: 'v_punto_equilibrio', libro: 'ld08', nombre: 'Punto de equilibrio real y real vs F3', fuentes: ['ld08_ventas_diarias', 'ld08_parametros', 'f3_supuestos'], ver: [SA, DG, AD, AC] },
    { clave: 'v_efectivo_conciliacion', libro: 'ld08', nombre: 'Conciliación de efectivo', fuentes: ['ld08_ventas_diarias', 'ld08_efectivo_entregas'], ver: [SA, DG, AD, AC] },
    { clave: 'v_f2_tablero', libro: 'f2', nombre: 'Tablero de costos y KPIs del menú', fuentes: ['f2_insumos', 'f2_recetas', 'f2_menu', 'f2_parametros'], ver: [SA, DG, AD, JO, AC] },
    { clave: 'v_f3_modelo', libro: 'f3', nombre: 'Modelo financiero · P&L, flujo, equilibrio y sensibilidad', fuentes: ['f3_supuestos', 'f3_capex'], ver: [SA, DG, AD, AC] }
  ];

  // ---- Matriz de permisos derivada ----
  function permisosDe(m) {
    const out = {};
    const verSet = new Set(m.solo ? m.solo : [SA, DG, AD].concat(m.cap, m.rev, m.ver || []));
    Object.keys(ROLES).forEach((rol) => {
      const cap = rol === SA ? !m.solo || m.solo.includes(SA) : m.cap.includes(rol);
      const rev = rol === SA ? true : m.rev.includes(rol);
      const anu = rol === SA || rol === AD && !m.solo || (m.solo && rol === DG) || (rol === RH && m.libro === 'ld05' && m.cap.includes(RH));
      const ver = verSet.has(rol) || cap || rev;
      if (ver) out[rol] = { ver: true, capturar: !!cap, revisar: !!rev, anular: !!anu && ver };
    });
    return out;
  }

  const api = { ROLES, LIBROS, MODULOS: M_, VISTAS, permisosDe, util: { n, r2, mins, dias, hoy, estadoFC, DIASEM, DIASL } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LD = api;
})(typeof window !== 'undefined' ? window : globalThis);
