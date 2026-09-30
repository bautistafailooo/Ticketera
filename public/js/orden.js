import { api, escapeHtml, formatDate, formatPrice } from "/js/common.js";

const content = document.getElementById("content");

// El link de la orden es /orden.html#<id>.<clave>. La clave no viaja al servidor en la URL.
const [orderId, token] = decodeURIComponent(location.hash.slice(1)).split(".");

const orderApi = (path = "", options = {}) =>
  api(`/orders/${encodeURIComponent(orderId)}${path}`, {
    ...options,
    headers: { "x-order-token": token },
  });

let countdown = null;

function header(order) {
  return `
    <h1>${escapeHtml(order.event.name)}</h1>
    <p class="muted">${escapeHtml(formatDate(order.event.startsAt))} · ${escapeHtml(order.event.venue)}</p>`;
}

function ticketSummary(order) {
  const counts = new Map();
  for (const t of order.tickets) {
    const row = counts.get(t.ticketType) ?? { quantity: 0, priceCents: t.priceCents };
    row.quantity++;
    counts.set(t.ticketType, row);
  }
  const rows = [...counts].map(([name, { quantity, priceCents }]) => `
    <tr><td>${quantity} × ${escapeHtml(name)}</td><td class="num">${formatPrice(quantity * priceCents)}</td></tr>`).join("");
  return `
    <div class="table-wrap"><table>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Total</th><th class="num">${formatPrice(order.totalCents)}</th></tr></tfoot>
    </table></div>`;
}

function renderPending(order) {
  content.innerHTML = `
    <p class="muted">Compra a nombre de ${escapeHtml(order.buyerName)}</p>
    ${header(order)}
    <div class="layout">
      <section class="card">
        <h2>Tu reserva</h2>
        ${ticketSummary(order)}
      </section>
      <section class="card">
        <h2>Pago</h2>
        <p>Tus entradas están reservadas por <strong id="countdown"></strong>. Si no pagás a tiempo, se liberan.</p>
        ${order.simulatedPayments
          ? `<button type="button" id="pay">Pagar ${formatPrice(order.totalCents)} (simulado)</button>
             <p class="muted">Modo de prueba: el pago se confirma sin cobrar.</p>`
          : '<p class="error">El pago en línea todavía no está disponible.</p>'}
        <p id="message" class="error" role="alert"></p>
      </section>
    </div>`;

  const countdownEl = document.getElementById("countdown");
  const expiresAt = new Date(order.expiresAt).getTime();
  const tick = () => {
    const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    countdownEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (seconds === 0) {
      clearInterval(countdown);
      load();
    }
  };
  tick();
  countdown = setInterval(tick, 1000);

  document.getElementById("pay")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await orderApi("/simulate-payment", { method: "POST" });
      clearInterval(countdown);
      await load();
    } catch (err) {
      document.getElementById("message").textContent = err.message;
      e.target.disabled = false;
    }
  });
}

function renderPaid(order) {
  content.innerHTML = `
    <p class="success">¡Compra confirmada!</p>
    ${header(order)}
    <p>A nombre de ${escapeHtml(order.buyerName)} · Total ${formatPrice(order.totalCents)}</p>
    <p class="muted">Mostrá el QR de cada entrada en la puerta. Si no se puede escanear, dictá el código que está debajo.</p>
    <div class="tickets">
      ${order.tickets.map((ticket) => `
        <div class="card ticket">
          <strong>${escapeHtml(ticket.ticketType)}</strong>
          <div class="qr"><img src="/tickets/${encodeURIComponent(ticket.code)}/qr.svg" alt="Código QR de la entrada"></div>
          <div class="code">${escapeHtml(ticket.code)}</div>
        </div>`).join("")}
    </div>
    <section class="card" style="margin-top: 24px">
      <h2>Guardá este link</h2>
      <p class="muted">Con este link podés volver a ver tus entradas. No lo compartas: quien lo tenga puede usarlas.</p>
      <div class="door-link">
        <input id="order-link" readonly value="${escapeHtml(location.href)}" aria-label="Link de tu compra">
        <button type="button" id="copy" class="button-secondary">Copiar</button>
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
}

function renderClosed(order) {
  const reason = order.status === "EXPIRED"
    ? "La reserva venció porque no se pagó a tiempo, y las entradas se liberaron."
    : "Esta compra fue cancelada.";
  content.innerHTML = `
    <p class="error">${reason}</p>
    ${header(order)}
    <p><a href="/evento.html?id=${encodeURIComponent(order.event.id)}">Volver a comprar</a></p>`;
}

async function load() {
  try {
    if (!orderId || !token) throw new Error("El link de la compra está incompleto.");
    const order = await orderApi();
    document.title = `${order.event.name} · Tu compra · Ticketera`;
    if (order.status === "PAID") renderPaid(order);
    else if (order.status === "PENDING") renderPending(order);
    else renderClosed(order);
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

load();
