import { api, escapeHtml, eventImage, formatDate, formatPrice } from "/js/common.js";

const content = document.getElementById("content");

// El link de la orden es /orden.html#<id>.<clave>. La clave no viaja al servidor en la URL.
const [orderId, token] = decodeURIComponent(location.hash.slice(1)).split(".");

const orderApi = (path = "", options = {}) =>
  api(`/orders/${encodeURIComponent(orderId)}${path}`, {
    ...options,
    headers: { "x-order-token": token },
  });

let countdown = null;

function header(order, badge) {
  return `
    <div class="order-head">
      <div class="thumb">${eventImage(order.event)}</div>
      <div>
        ${badge}
        <h1 style="margin: 8px 0 4px">${escapeHtml(order.event.name)}</h1>
        <div class="muted">${escapeHtml(formatDate(order.event.startsAt))} h · ${escapeHtml(order.event.venue)}</div>
      </div>
    </div>`;
}

function summary(order) {
  const counts = new Map();
  for (const t of order.tickets) {
    const row = counts.get(t.ticketType) ?? { quantity: 0, priceCents: t.priceCents };
    row.quantity++;
    counts.set(t.ticketType, row);
  }
  const rows = [...counts].map(([name, { quantity, priceCents }]) =>
    `<li><span>${quantity} × ${escapeHtml(name)}</span><span>${formatPrice(quantity * priceCents)}</span></li>`).join("");
  return `
    <ul class="lines">${rows}</ul>
    <div class="total-line"><span>Total</span><span class="amount">${formatPrice(order.totalCents)}</span></div>`;
}

function renderPending(order) {
  content.innerHTML = `
    ${header(order, '<span class="badge warn">Reserva pendiente de pago</span>')}
    <div class="two-col">
      <section class="card">
        <h2>Tu reserva</h2>
        <p class="muted small">A nombre de ${escapeHtml(order.buyerName)} · ${escapeHtml(order.buyerEmail)}</p>
        ${summary(order)}
      </section>
      <section class="card">
        <h2>Pago</h2>
        <p class="muted" style="margin-bottom: 4px">Tus entradas están reservadas por</p>
        <div class="countdown" id="countdown">--:--</div>
        <p class="muted small">Si no pagás a tiempo, se liberan para otras personas.</p>
        ${order.simulatedPayments
          ? `<button type="button" class="btn btn-gradient btn-block" id="pay">Pagar ${formatPrice(order.totalCents)}</button>
             <p class="field-hint">Modo de prueba: el pago se confirma sin cobrar.</p>`
          : '<p class="notice warn">El pago en línea todavía no está disponible.</p>'}
        <p id="message" class="error" role="alert" style="margin: 12px 0 0"></p>
      </section>
    </div>`;

  const countdownEl = document.getElementById("countdown");
  const expiresAt = new Date(order.expiresAt).getTime();
  const tick = () => {
    const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    countdownEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    countdownEl.classList.toggle("low", seconds < 120);
    if (seconds === 0) {
      clearInterval(countdown);
      load();
    }
  };
  tick();
  countdown = setInterval(tick, 1000);

  document.getElementById("pay")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Procesando pago…";
    try {
      await orderApi("/simulate-payment", { method: "POST" });
      clearInterval(countdown);
      await load();
    } catch (err) {
      document.getElementById("message").textContent = err.message;
      e.target.disabled = false;
      e.target.textContent = `Pagar ${formatPrice(order.totalCents)}`;
    }
  });
}

function renderPaid(order) {
  const when = formatDate(order.event.startsAt);
  content.innerHTML = `
    ${header(order, '<span class="badge ok">¡Compra confirmada!</span>')}
    <p class="notice ok">Mostrá el QR de cada entrada en la puerta. Si no se puede escanear, dictá el código que está debajo.</p>
    <div class="tickets">
      ${order.tickets.map((ticket, i) => `
        <article class="ticket-stub">
          <div class="info">
            <span class="faint small">Entrada ${i + 1} de ${order.tickets.length}</span>
            <span class="type">${escapeHtml(ticket.ticketType)}</span>
            <strong>${escapeHtml(order.event.name)}</strong>
            <dl>
              <dt>Cuándo</dt><dd>${escapeHtml(when)} h</dd>
              <dt>Dónde</dt><dd>${escapeHtml(order.event.venue)}</dd>
              <dt>Titular</dt><dd>${escapeHtml(order.buyerName)}</dd>
            </dl>
          </div>
          <div class="qr-side">
            <div class="qr"><img src="/tickets/${encodeURIComponent(ticket.code)}/qr.svg" alt="Código QR de la entrada ${i + 1}"></div>
            <div class="ticket-code">${escapeHtml(ticket.code)}</div>
          </div>
        </article>`).join("")}
    </div>

    <section class="card" style="margin-top: 24px">
      <h2>Te las mandamos por mail</h2>
      <p class="muted">Enviamos las entradas a <strong style="color: var(--text)">${escapeHtml(order.buyerEmail)}</strong>. Si no te llegaron, revisá el spam o reenvialas.</p>
      <div class="form-actions" style="margin-top: 8px">
        <button type="button" class="btn btn-secondary" id="resend">Reenviar por mail</button>
      </div>
      <p id="resend-message" role="status" style="margin: 12px 0 0"></p>
    </section>

    <section class="card" style="margin-top: 24px">
      <h2>Guardá este link</h2>
      <p class="muted">Con este link volvés a ver tus entradas cuando quieras. No lo compartas: quien lo tenga puede usarlas.</p>
      <div class="link-box">
        <input id="order-link" readonly value="${escapeHtml(location.href)}" aria-label="Link de tu compra">
        <button type="button" id="copy" class="btn btn-secondary">Copiar</button>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="print">Imprimir entradas</button>
      </div>
    </section>`;

  document.getElementById("copy").addEventListener("click", async (e) => {
    const input = document.getElementById("order-link");
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
    }
    e.target.textContent = "¡Copiado!";
    setTimeout(() => (e.target.textContent = "Copiar"), 2000);
  });
  document.getElementById("print").addEventListener("click", () => print());

  document.getElementById("resend").addEventListener("click", async (e) => {
    const message = document.getElementById("resend-message");
    e.target.disabled = true;
    try {
      const res = await orderApi("/resend-email", { method: "POST" });
      message.className = "success";
      message.textContent = `Listo, las reenviamos a ${res.email}.`;
    } catch (err) {
      message.className = "error";
      message.textContent = err.message;
    }
    setTimeout(() => (e.target.disabled = false), 5000);
  });
}

function renderClosed(order) {
  const reason = order.status === "EXPIRED"
    ? "La reserva venció porque no se pagó a tiempo, y las entradas se liberaron."
    : "Esta compra fue cancelada.";
  content.innerHTML = `
    ${header(order, `<span class="badge danger">${order.status === "EXPIRED" ? "Reserva vencida" : "Cancelada"}</span>`)}
    <div class="empty">
      <p>${reason}</p>
      <a class="btn btn-gradient" href="/evento.html?id=${encodeURIComponent(order.event.id)}">Volver a comprar</a>
    </div>`;
}

async function load() {
  try {
    if (!orderId || !token) throw new Error("El link de la compra está incompleto.");
    const order = await orderApi();
    document.title = document.title.replace(/^Tu compra/, `${order.event.name} · Tu compra`);
    if (order.status === "PAID") renderPaid(order);
    else if (order.status === "PENDING") renderPending(order);
    else renderClosed(order);
  } catch (err) {
    content.innerHTML = `<div class="empty"><p class="error">${escapeHtml(err.message)}</p><a class="btn btn-secondary" href="/">Ir a la cartelera</a></div>`;
  }
}

load();
