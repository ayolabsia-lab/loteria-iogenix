/* Lotería iO.GENIX · App del cliente */
(function () {
  'use strict';
  const { rpc } = window.LotAPI;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  let state = null;      // estado público
  let current = null;    // décimo mostrado {ticket, order, email}
  let images = {};       // blobs del décimo
  let countdownTimer = null;

  // ---------- Utilidades ----------
  function toast(text) {
    const t = $('#toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function remember(order, email) {
    const list = (store('lot_mine') || []).filter((x) => x.order !== order);
    list.unshift({ order, email });
    store('lot_mine', list.slice(0, 20));
    renderMine();
  }
  function renderMine() {
    const list = store('lot_mine') || [];
    const box = $('#mine');
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<span class="small">Mis décimos:</span>' + list.map((x, i) =>
      `<button class="chip" data-i="${i}">Pedido <b>${esc(x.order)}</b></button>`).join('');
    box.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
      const x = list[+b.dataset.i];
      $('#f-order').value = x.order; $('#f-email').value = x.email;
      lookup(x.order, x.email, true);
    }));
  }
  function snow() {
    const box = document.querySelector('.snow');
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('i');
      const size = 2 + Math.random() * 4;
      s.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;opacity:${0.25 + Math.random() * 0.6};animation-duration:${9 + Math.random() * 14}s;animation-delay:${-Math.random() * 20}s`;
      box.appendChild(s);
    }
  }

  // ---------- Estado de la promoción ----------
  async function loadState() {
    try {
      state = await rpc('lot_public_state');
    } catch (e) {
      state = null;
      return;
    }
    const b = $('#phase-banner');
    if (state.phase === 'antes') {
      b.hidden = false;
      b.textContent = 'La Lotería iO.GENIX abre el ' + fmtDate(state.reg_open) + ' h. ¡Guarda este enlace!';
    } else if (state.phase === 'cerrado') {
      b.hidden = false;
      b.textContent = state.results_published
        ? '¡Ya tenemos el Gordo! Introduce tus datos para comprobar tu décimo.'
        : 'El plazo para conseguir décimos ha terminado. Si ya tienes el tuyo, introduce tus datos para consultarlo.';
      $('#form-title').textContent = 'Consulta tu décimo';
      $('#f-submit').textContent = 'Ver mi décimo';
    } else {
      b.hidden = true;
    }
  }

  // ---------- Formulario ----------
  async function lookup(order, email, fromMine) {
    const msg = $('#form-msg');
    msg.className = 'msg'; msg.textContent = '';
    const btn = $('#f-submit');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Un momento…';
    try {
      const t = await rpc('lot_get_ticket', { p_order: order, p_email: email });
      current = { ticket: t, order: t.order_ref, email: email.trim().toLowerCase() };
      remember(t.order_ref, current.email);
      showTicket(t);
      if (t.nuevo) toast('¡Décimo conseguido! Tu número es el ' + t.number);
    } catch (e) {
      msg.className = 'msg err';
      msg.textContent = e.message;
      if (fromMine) document.getElementById('form-card').scrollIntoView({ behavior: 'smooth' });
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  }

  $('#ticket-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const order = $('#f-order').value.trim();
    const email = $('#f-email').value.trim();
    const msg = $('#form-msg');
    if (!order || !email) { msg.className = 'msg err'; msg.textContent = 'Rellena la referencia del pedido y tu email.'; return; }
    if (!$('#f-accept').checked) { msg.className = 'msg err'; msg.textContent = 'Para participar tienes que aceptar las bases legales.'; return; }
    lookup(order, email);
  });

  // ---------- Vista del décimo ----------
  async function showTicket(t) {
    $('#form-card').hidden = true;
    $('#ticket-view').hidden = false;
    $('#t-order').textContent = t.order_ref;
    $('#t-number').textContent = t.number;
    $('#t-status').innerHTML = t.status === 'anulado'
      ? '<span class="badge red">Décimo anulado</span> El pedido se canceló o se devolvió, así que este décimo no participa.'
      : (t.is_test ? '<span class="badge">Décimo de prueba</span>' : 'Número asignado al azar · único y válido para el sorteo del 22 de diciembre');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    renderCheck(t);
    renderCode(t);
    updateShareUI(t);

    const wrap = $('#t-img-wrap');
    wrap.className = 'decimo-img loading'; wrap.textContent = 'Preparando tu décimo…';
    images = {};
    try {
      const dc = await window.LotDecimo.renderDecimo({ number: t.number, orderRef: t.order_ref });
      const sc = await window.LotDecimo.renderStories(dc, t.number);
      images.decimo = await window.LotDecimo.toBlob(dc, 'image/png');
      images.story = await window.LotDecimo.toBlob(sc, 'image/png');
      const img = new Image();
      img.alt = 'Tu décimo de la Lotería iO.GENIX con el número ' + t.number;
      img.className = 'decimo-img';
      img.src = URL.createObjectURL(images.decimo);
      wrap.replaceWith(img); img.id = 't-img-wrap';
    } catch (e) {
      wrap.textContent = 'No hemos podido generar la imagen. Recarga la página para intentarlo de nuevo.';
    }
  }

  function digitsHTML(num, hits) {
    return '<div class="result-num">' + num.split('').map((d, i) => `<span class="${i >= 5 - hits ? 'hit' : ''}">${d}</span>`).join('') + '</div>';
  }
  function matchCount(a, b) { let n = 0; for (let i = 4; i >= 0 && a[i] === b[i]; i--) n++; return n; }

  function renderCheck(t) {
    const box = $('#check-card');
    clearInterval(countdownTimer);
    if (t.results_published && t.winning_number) {
      const hits = matchCount(t.number, t.winning_number);
      let html = '<h2>Comprueba tu décimo</h2><p class="small" style="text-align:center;margin:0">Número del Gordo de Navidad 2026</p>' +
        digitsHTML(t.winning_number, 0) +
        '<p class="small" style="text-align:center;margin:10px 0 0">Tu número</p>' + digitsHTML(t.number, Math.min(hits, 5));
      if (t.status === 'anulado') {
        html += '<p class="win" style="color:var(--muted)">Este décimo está anulado y no participa en los premios.</p>';
      } else if (t.prize > 0) {
        html += `<p class="win">🎉 ¡Enhorabuena! Has ganado ${t.prize === 1000 ? '1.000' : t.prize} € en productos iO.GENIX</p>`;
        html += t.prize_code
          ? `<div class="code"><b>${esc(t.prize_code)}</b><button class="btn btn-ghost btn-sm" data-copy="${esc(t.prize_code)}">Copiar</button></div><p class="small">Cupón de un solo uso para un único pedido en la web.</p>`
          : '<p class="small" style="text-align:center">Te enviaremos tu cupón al email del pedido en los próximos días. También aparecerá aquí.</p>';
      } else {
        html += '<p class="win" style="color:var(--text)">Esta vez no ha tocado… ¡gracias por participar!</p><p class="small" style="text-align:center">Tu código de descuento sigue activo hasta el 30 de enero.</p>';
      }
      box.innerHTML = html;
    } else {
      const target = new Date((state && state.draw_at) || '2026-12-22T09:00:00+01:00');
      box.innerHTML = '<h2>Comprueba tu décimo</h2><p class="small">El Gordo se sortea el 22 de diciembre. Vuelve aquí ese día: comprobaremos tu número automáticamente en cuanto se publique el resultado.</p>' +
        '<div class="countdown" id="cd"><div><b>–</b><span>días</span></div><div><b>–</b><span>horas</span></div><div><b>–</b><span>min</span></div><div><b>–</b><span>seg</span></div></div>';
      const tick = () => {
        const ms = Math.max(0, target - new Date());
        const v = [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60, Math.floor(ms / 1e3) % 60];
        const cd = document.getElementById('cd');
        if (!cd) return;
        cd.querySelectorAll('b').forEach((b, i) => { b.textContent = String(v[i]).padStart(2, '0'); });
      };
      tick(); countdownTimer = setInterval(tick, 1000);
    }
  }

  function renderCode(t) {
    const box = $('#code-card');
    if (!t.discount_code) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<h2>Tu regalo por participar 🎁</h2>
      <p class="small" style="margin:0">${esc(t.discount_text)}</p>
      <div class="code"><b>${esc(t.discount_code)}</b><button class="btn btn-ghost btn-sm" data-copy="${esc(t.discount_code)}">Copiar</button></div>
      <a class="btn btn-gold" href="${esc(window.LOT_CONFIG.SHOP_URL)}" rel="noopener">Ir a la tienda</a>`;
  }

  function updateShareUI() {
    $('#share-msg').textContent = 'Compártelo en tus stories y que tus amigos también consigan el suyo.';
  }

  async function markShared() {
    if (!current || current.ticket.shared) return;
    try {
      await rpc('lot_mark_shared', { p_order: current.order, p_email: current.email });
      current.ticket.shared = true;
      toast('¡Gracias por compartir!');
    } catch (e) { /* silencioso */ }
  }

  function download(blob, name) {
    if (!blob) { toast('La imagen aún se está generando…'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  $('#b-dl').addEventListener('click', () => download(images.decimo, `decimo-iogenix-${current.ticket.number}.png`));
  $('#b-dl-story').addEventListener('click', () => download(images.story, `stories-iogenix-${current.ticket.number}.png`));
  $('#b-share').addEventListener('click', async () => {
    if (!images.story) { toast('La imagen aún se está generando…'); return; }
    const file = new File([images.story], `iogenix-decimo-${current.ticket.number}.png`, { type: 'image/png' });
    const data = { files: [file], title: 'Mi décimo de la Lotería iO.GENIX', text: '¡Ya tengo mi décimo de la Lotería iO.GENIX! Nº ' + current.ticket.number + ' 🎄' };
    if (navigator.canShare && navigator.canShare(data)) {
      try {
        await navigator.share(data);
        markShared();
      } catch (e) {
        if (e && e.name !== 'AbortError') toast('No se pudo compartir. Descarga la imagen y súbela a tus stories.');
      }
    } else {
      download(images.story, `stories-iogenix-${current.ticket.number}.png`);
      $('#share-msg').textContent = 'Te hemos descargado la imagen: súbela a tus stories.';
    }
  });
  $('#b-other').addEventListener('click', () => {
    $('#ticket-view').hidden = true;
    $('#form-card').hidden = false;
    $('#f-order').value = '';
    $('#form-msg').textContent = '';
    $('#f-order').focus();
    window.scrollTo({ top: $('#form-card').offsetTop - 20, behavior: 'smooth' });
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-copy]');
    if (!b) return;
    const v = b.getAttribute('data-copy');
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(
      () => toast('Código copiado: ' + v),
      () => toast('Tu código: ' + v)
    );
  });

  // ---------- Inicio ----------
  (async function init() {
    snow();
    renderMine();
    const qs = new URLSearchParams(location.search);
    const qOrder = qs.get('pedido') || qs.get('ref') || '';
    const qEmail = qs.get('email') || '';
    if (qOrder) $('#f-order').value = qOrder;
    if (qEmail) $('#f-email').value = qEmail;
    await loadState();
    window.LotDecimo.loadAssets().catch(() => {});
    if (qOrder && qEmail) $('#f-accept').focus();
  })();
})();
