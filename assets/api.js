/* Lotería iO.GENIX · Cliente de la API (Supabase RPC) */
(function () {
  'use strict';
  const C = window.LOT_CONFIG;

  const MESSAGES = {
    pedido_invalido: 'Revisa la referencia del pedido: debe ser tal y como aparece en el email de confirmación.',
    email_invalido: 'Revisa el email: tiene que ser el mismo con el que hiciste la compra.',
    email_no_coincide: 'Ese pedido ya tiene un décimo asociado a otro email. Usa el email con el que hiciste la compra.',
    aun_no_abierto: 'La Lotería iO.GENIX abre el 1 de diciembre. ¡Vuelve ese día con tu referencia de pedido!',
    cerrado: 'El plazo para conseguir décimos terminó el 21 de diciembre a las 23:59.',
    limite_email: 'Has alcanzado el máximo de décimos para este email. Escríbenos y lo revisamos.',
    sin_numeros: 'No hemos podido asignar un número ahora mismo. Inténtalo de nuevo en unos minutos.',
    no_encontrado: 'No encontramos ese décimo.',
    no_autorizado: 'Contraseña incorrecta.',
    demasiados_intentos: 'Demasiados intentos fallidos. Espera 10 minutos.',
    numero_invalido: 'El número ganador debe tener 5 cifras.',
    primero_resultado: 'Primero hay que publicar el resultado del Gordo.',
    pocos_participantes: 'No hay suficientes participantes para ese número de ganadores y suplentes.',
    ganadores_invalido: 'Indica al menos 1 ganador.',
    password_corta: 'La nueva contraseña debe tener al menos 8 caracteres.',
    estado_invalido: 'Estado no válido.'
  };

  class LotError extends Error {
    constructor(code, raw) { super(MESSAGES[code] || 'Algo ha fallado. Inténtalo de nuevo en unos segundos.'); this.code = code; this.raw = raw; }
  }

  async function rpc(fn, args) {
    const headers = { 'Content-Type': 'application/json', apikey: C.SUPABASE_KEY };
    if (!/^sb_/.test(C.SUPABASE_KEY)) headers.Authorization = 'Bearer ' + C.SUPABASE_KEY;
    let res;
    try {
      res = await fetch(C.SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(args || {}) });
    } catch (e) {
      throw new LotError('red', e);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const code = data && data.message ? String(data.message).trim() : 'error';
      throw new LotError(code, data);
    }
    return data;
  }

  window.LotAPI = { rpc, LotError, MESSAGES };
})();
