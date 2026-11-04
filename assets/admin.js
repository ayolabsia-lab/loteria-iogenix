/* Lotería iO.GENIX · Panel interno */
(function () {
  'use strict';
  const { rpc } = window.LotAPI;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (d) => d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  let PW = '';
  let D = null;           // datos del panel
  let page = 0; const PER = 100;

  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600); }
  function msg(sel, text, ok) { const el = $(sel); el.className = 'msg ' + (ok ? 'ok' : 'err'); el.textContent = text; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function toLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
  function csv(rows, name) {
    const s = rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + s], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- Login ----------
  async function login(pw) {
    const ok = await rpc('lot_admin_login', { p_pw: pw });
    if (!ok) throw new window.LotAPI.LotError('no_autorizado');
    PW = pw; ss('lot_pw', pw);
    $('#login').hidden = true; $('#app').hidden = false;
    await load();
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await login($('#pw').value); } catch (err) { $('#login-msg').textContent = err.message; }
  });
  $('#b-logout').addEventListener('click', () => { ss('lot_pw', null); location.reload(); });
  $('#b-refresh').addEventListener('click', () => load().then(() => toast('Datos actualizados')));

  // ---------- Pestañas ----------
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  });

  // ---------- Carga ----------
  async function load() {
    D = await rpc('lot_admin_dashboard', { p_pw: PW });
    renderSummary(); renderTable(); renderWinners(); renderTombola(); renderPacks(); renderSettings();
  }

  function renderSummary() {
    const s = D.stats;
    const k = [['Décimos', s.total], ['Activos', s.activos], ['Anulados', s.anulados], ['Clientes (emails)', s.emails], ['Han compartido', s.compartidos], ['Pruebas', s.pruebas]];
    $('#kpis').innerHTML = k.map(([l, v]) => `<div class="kpi"><b>${(v || 0).toLocaleString('es-ES')}</b><span>${l}</span></div>`).join('');
    const days = D.por_dia || [];
    const max = Math.max(1, ...days.map((d) => d.n));
    $('#bars').innerHTML = days.length ? days.map((d) => `<div style="height:${Math.max(2, d.n / max * 100)}%" data-t="${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${d.n}"></div>`).join('') : '<p class="small">Aún no hay décimos.</p>';
    const c = D.config;
    $('#phase-info').innerHTML = `Registro: ${fmt(c.reg_open)} → ${fmt(c.reg_close)} · Resultado: ${c.results_published ? '<span class="badge green">publicado ' + esc(c.winning_number) + '</span>' : '<span class="badge">sin publicar</span>'}`;
  }

  // ---------- Participantes ----------
  function filtered() {
    const q = $('#q').value.trim().toLowerCase();
    const f = $('#filter').value;
    return D.tickets.filter((t) => {
      if (f === 'prueba' ? !t.is_test : t.is_test) return false;
      if (f === 'activo' && t.status !== 'activo') return false;
      if (f === 'anulado' && t.status !== 'anulado') return false;
      if (f === 'compartido' && !t.shared) return false;
      if (f === 'premio' && !(t.prize > 0)) return false;
      if (q && !(t.order_ref.toLowerCase().includes(q) || t.email.includes(q) || t.number.includes(q))) return false;
      return true;
    });
  }
  function renderTable() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PER));
    page = Math.min(page, pages - 1);
    const slice = rows.slice(page * PER, page * PER + PER);
    $('#tbody').innerHTML = slice.map((t) => `<tr>
      <td>${fmt(t.created_at)}</td><td><b>${esc(t.order_ref)}</b></td><td>${esc(t.email)}</td><td class="num">${t.number}</td>
      <td>${t.status === 'activo' ? '<span class="badge green">activo</span>' : '<span class="badge red" title="' + esc(t.note || '') + '">anulado</span>'}</td>
      <td>${t.shared ? '✔' : ''}</td><td>${t.prize ? t.prize + ' €' : ''}</td>
      <td><button class="btn btn-dark btn-sm" data-act="${t.status === 'activo' ? 'anular' : 'reactivar'}" data-ref="${esc(t.order_ref)}">${t.status === 'activo' ? 'Anular' : 'Reactivar'}</button></td></tr>`).join('') ||
      '<tr><td colspan="8" class="small">Sin resultados</td></tr>';
    $('#pg-info').textContent = `${rows.length.toLocaleString('es-ES')} décimos · página ${page + 1}/${pages}`;
  }
  $('#q').addEventListener('input', () => { page = 0; renderTable(); });
  $('#filter').addEventListener('change', () => { page = 0; renderTable(); });
  $('#pg-prev').addEventListener('click', () => { page = Math.max(0, page - 1); renderTable(); });
  $('#pg-next').addEventListener('click', () => { page++; renderTable(); });
  $('#tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const anular = b.dataset.act === 'anular';
    if (anular && !confirm('¿Anular el décimo del pedido ' + b.dataset.ref + '?')) return;
    try {
      await rpc('lot_admin_set_status', { p_pw: PW, p_order: b.dataset.ref, p_status: anular ? 'anulado' : 'activo', p_note: anular ? 'Anulado desde el panel' : null });
      await load(); toast(anular ? 'Décimo anulado' : 'Décimo reactivado');
    } catch (err) { toast(err.message); }
  });
  $('#b-csv').addEventListener('click', () => {
    csv([['Fecha', 'Pedido', 'Email', 'Número', 'Estado', 'Compartido', 'Premio', 'Cupón', 'Nota', 'Prueba']].concat(
      filtered().map((t) => [fmt(t.created_at), t.order_ref, t.email, t.number, t.status, t.shared ? 'sí' : 'no', t.prize || 0, t.prize_code || '', t.note || '', t.is_test ? 'sí' : 'no'])), 'loteria-iogenix-participantes.csv');
  });
  $('#b-bulk').addEventListener('click', async () => {
    const refs = $('#bulk').value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!refs.length) return msg('#bulk-msg', 'Pega al menos una referencia.');
    if (!confirm(`¿Anular ${refs.length} décimo(s)?`)) return;
    try {
      const r = await rpc('lot_admin_bulk_cancel', { p_pw: PW, p_orders: refs, p_note: $('#bulk-note').value || 'Pedido cancelado o devuelto' });
      msg('#bulk-msg', `Anulados: ${r.anulados}.` + (r.no_encontrados.length ? ' Sin décimo: ' + r.no_encontrados.join(', ') : ''), true);
      $('#bulk').value = ''; await load();
    } catch (err) { msg('#bulk-msg', err.message); }
  });

  // ---------- Resultado ----------
  function winners() { return D.tickets.filter((t) => t.prize > 0 && !t.is_test && t.status === 'activo').sort((a, b) => b.prize - a.prize); }
  function renderWinners() {
    const c = D.config;
    $('#win').value = c.winning_number || '';
    const w = winners();
    const total = w.reduce((s, t) => s + t.prize, 0);
    $('#win-sum').textContent = c.winning_number ? `· ${w.length} premiados · ${total.toLocaleString('es-ES')} € en total${c.results_published ? '' : ' (vista previa, sin publicar)'}` : '';
    $('#win-body').innerHTML = w.map((t) => `<tr><td><b>${t.prize} €</b></td><td>${esc(t.order_ref)}</td><td>${esc(t.email)}</td><td class="num">${t.number}</td>
      <td><input type="text" value="${esc(t.prize_code || '')}" data-code="${esc(t.order_ref)}" style="margin:0;min-width:160px;padding:8px"></td>
      <td><button class="btn btn-dark btn-sm" data-save="${esc(t.order_ref)}">Guardar</button></td></tr>`).join('') ||
      `<tr><td colspan="6" class="small">${c.winning_number ? 'Ningún décimo activo coincide con ' + esc(c.winning_number) + '.' : 'Introduce el número del Gordo.'}</td></tr>`;
  }
  async function setResult(publish) {
    const v = $('#win').value.trim();
    if (!/^\d{5}$/.test(v) && publish !== null) return msg('#win-msg', 'El número debe tener 5 cifras.');
    if (publish && !confirm('¿Publicar el ' + v + ' como número del Gordo? Todos los clientes verán su resultado en la app.')) return;
    try {
      await rpc('lot_admin_set_result', { p_pw: PW, p_winning: publish === null ? (D.config.winning_number || null) : v, p_publish: !!publish });
      await load();
      msg('#win-msg', publish ? 'Resultado publicado en la app.' : (publish === null ? 'Resultado retirado de la app.' : 'Ganadores calculados (sin publicar).'), true);
    } catch (err) { msg('#win-msg', err.message); }
  }
  $('#b-preview').addEventListener('click', () => setResult(false));
  $('#b-publish').addEventListener('click', () => setResult(true));
  $('#b-unpublish').addEventListener('click', () => setResult(null));
  $('#win-body').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-save]'); if (!b) return;
    const input = document.querySelector(`input[data-code="${CSS.escape(b.dataset.save)}"]`);
    try { await rpc('lot_admin_set_prize_code', { p_pw: PW, p_order: b.dataset.save, p_code: input.value }); toast('Cupón guardado'); await load(); }
    catch (err) { toast(err.message); }
  });
  $('#b-win-csv').addEventListener('click', () => {
    csv([['Premio (€)', 'Pedido', 'Email', 'Número', 'Cupón']].concat(winners().map((t) => [t.prize, t.order_ref, t.email, t.number, t.prize_code || ''])), 'loteria-iogenix-ganadores.csv');
  });

  // ---------- Tómbola ----------
  function renderTombola() {
    const t = D.config.tombola || {};
    $('#tb-activa').checked = !!t.activa;
    $('#tb-premio').value = t.premio || '';
    $('#tb-desc').value = t.descripcion || '';
    $('#tb-gan').value = t.ganadores || 0;
    $('#tb-sup').value = t.suplentes || 0;
    $('#tb-fecha').value = t.fecha || '';
    $('#draws').innerHTML = (D.tombola_draws || []).map((d) => `<div class="card" style="box-shadow:none;margin:12px 0 0">
      <p style="margin:0 0 8px">${d.official ? '<span class="badge green">oficial</span>' : '<span class="badge">anterior</span>'} <span class="small">${fmt(d.created_at)} · ${d.pool_size} décimos · ${d.entries} participaciones</span></p>
      <p style="margin:0"><b>Ganadores:</b> ${d.winners.map((w) => `${esc(w.order_ref)} (${esc(w.email)}, nº ${w.number})`).join(' · ')}</p>
      ${d.substitutes.length ? `<p class="small" style="margin:6px 0 0"><b>Suplentes:</b> ${d.substitutes.map((w) => `${esc(w.order_ref)} (${esc(w.email)})`).join(' · ')}</p>` : ''}</div>`).join('');
  }
  function tombolaCfg() {
    return { activa: $('#tb-activa').checked, premio: $('#tb-premio').value.trim(), descripcion: $('#tb-desc').value.trim(),
      ganadores: +$('#tb-gan').value || 0, suplentes: +$('#tb-sup').value || 0, fecha: $('#tb-fecha').value.trim() };
  }
  $('#b-tb-save').addEventListener('click', async () => {
    try { await rpc('lot_admin_save_config', { p_pw: PW, p_cfg: { tombola: tombolaCfg() } }); await load(); msg('#tb-msg', 'Guardado.', true); }
    catch (err) { msg('#tb-msg', err.message); }
  });
  $('#b-tb-draw').addEventListener('click', async () => {
    const c = tombolaCfg();
    if (!c.ganadores) return msg('#draw-msg', 'Indica el número de ganadores en la configuración y guárdala.');
    if (!confirm(`¿Sortear ahora ${c.ganadores} ganador(es) y ${c.suplentes} suplente(s)?`)) return;
    try {
      await rpc('lot_admin_tombola_draw', { p_pw: PW, p_winners: c.ganadores, p_substitutes: c.suplentes, p_note: c.premio || null });
      await load(); msg('#draw-msg', 'Sorteo realizado. Los participantes verán su resultado en la app.', true);
    } catch (err) { msg('#draw-msg', err.message); }
  });

  // ---------- Packs ----------
  const PF = [['nombre', 'Nombre'], ['descripcion', 'Descripción'], ['precio', 'Precio (ej. 59,90 €)'], ['precio_antes', 'Precio anterior (opcional)'], ['imagen', 'URL de la imagen'], ['url', 'Enlace al producto en la tienda']];
  let packs = [];
  function renderPacks() {
    packs = JSON.parse(JSON.stringify(D.config.packs || []));
    drawPacks();
  }
  function drawPacks() {
    $('#packs-ed').innerHTML = packs.length ? packs.map((p, i) => `<div class="pack-ed"><div class="row">${PF.map(([k, l]) =>
      `<label>${l}<input type="text" data-i="${i}" data-k="${k}" value="${esc(p[k] || '')}"></label>`).join('')}</div>
      <button class="btn btn-ghost btn-sm" data-del="${i}">Eliminar pack</button></div>`).join('') : '<p class="soon">Sin packs todavía. En la app se muestra «Muy pronto».</p>';
  }
  $('#packs-ed').addEventListener('input', (e) => { const i = e.target.dataset.i; if (i != null) packs[i][e.target.dataset.k] = e.target.value; });
  $('#packs-ed').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { packs.splice(+b.dataset.del, 1); drawPacks(); } });
  $('#b-pack-add').addEventListener('click', () => { packs.push({}); drawPacks(); });
  $('#b-pack-save').addEventListener('click', async () => {
    const clean = packs.filter((p) => p.nombre && p.nombre.trim());
    try { await rpc('lot_admin_save_config', { p_pw: PW, p_cfg: { packs: clean } }); await load(); msg('#pack-msg', 'Packs guardados.', true); }
    catch (err) { msg('#pack-msg', err.message); }
  });

  // ---------- Ajustes ----------
  function renderSettings() {
    const c = D.config;
    $('#cfg-open').value = toLocalInput(c.reg_open);
    $('#cfg-close').value = toLocalInput(c.reg_close);
    $('#cfg-draw').value = toLocalInput(c.draw_at);
    $('#cfg-code').value = c.discount_code || '';
    $('#cfg-dtext').value = c.discount_text || '';
    const base = location.href.replace(/admin\.html.*$/, '');
    $('#email-link').textContent = base + '?pedido={order_name}&email={email}';
  }
  $('#b-cfg-save').addEventListener('click', async () => {
    const iso = (v) => v ? new Date(v).toISOString() : null;
    try {
      await rpc('lot_admin_save_config', { p_pw: PW, p_cfg: { reg_open: iso($('#cfg-open').value), reg_close: iso($('#cfg-close').value), draw_at: iso($('#cfg-draw').value), discount_code: $('#cfg-code').value.trim(), discount_text: $('#cfg-dtext').value.trim() } });
      await load(); msg('#cfg-msg', 'Ajustes guardados.', true);
    } catch (err) { msg('#cfg-msg', err.message); }
  });
  $('#b-del-tests').addEventListener('click', async () => {
    if (!confirm('¿Borrar todos los décimos de prueba (TEST…)?')) return;
    try { const n = await rpc('lot_admin_delete_tests', { p_pw: PW }); await load(); msg('#test-msg', `Borrados ${n} décimos de prueba.`, true); }
    catch (err) { msg('#test-msg', err.message); }
  });
  $('#b-pw').addEventListener('click', async () => {
    const v = $('#new-pw').value;
    try { await rpc('lot_admin_change_password', { p_pw: PW, p_new: v }); PW = v; ss('lot_pw', v); $('#new-pw').value = ''; msg('#pw-msg', 'Contraseña cambiada. Compártela con el equipo.', true); }
    catch (err) { msg('#pw-msg', err.message); }
  });

  // ---------- Inicio ----------
  const saved = ss('lot_pw');
  if (saved) login(saved).catch(() => ss('lot_pw', null));
})();
