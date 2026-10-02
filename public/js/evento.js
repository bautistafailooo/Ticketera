import { api, dateParts, escapeHtml, eventImage, formatDate, formatPrice, serviceFee } from "/js/common.js";

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Argentina/Buenos_Aires",
});

const MAX_TICKETS = 10;
const content = document.getElementById("content");
const eventId = new URLSearchParams(location.search).get("id");

function render(event) {
  document.title = document.title.replace(/^Evento/, event.name);
  const quantities = new Map(event.ticketTypes.map((t) => [t.id, 0]));
  // Solo se pueden elegir los lotes a la venta (no los terminados ni los que todavía no empezaron).
  const available = (t) => (t.status === "onsale" ? Math.max(0, t.capacity - t.sold) : 0);
  const allSoldOut = event.ticketTypes.every((t) => available(t) === 0);
  const allEnded = event.ticketTypes.every((t) => t.status === "ended");

  const lotNote = (t, left) => {
    if (t.status === "ended") return "La venta de este lote terminó";
    if (t.status === "upcoming") return t.opensAfterName ? `Se habilita cuando termine ${escapeHtml(t.opensAfterName)}` : "Próximamente";
    if (left === 0) return "Agotado";
    const until = t.salesEndAt ? ` · hasta el ${escapeHtml(formatDate(t.salesEndAt))} h` : "";
    return `${left <= 20 ? `¡Quedan ${left}!` : "Disponible"}${until}`;
  };
  const lotBadge = (t) =>
    t.status === "ended" ? '<span class="badge">Finalizó</span>'
      : t.status === "upcoming" ? '<span class="badge warn">Próximamente</span>'
        : '<span class="badge danger">Agotado</span>';

  const options = event.ticketTypes.map((t) => {
    const left = available(t);
    return `
      <div class="ticket-option ${left === 0 ? "sold-out" : ""}" data-option="${escapeHtml(t.id)}">
        <div class="ticket-main">
          <div class="name">${escapeHtml(t.name)}</div>
          <div class="price">${t.priceCents === 0 ? "Gratis" : formatPrice(t.priceCents)}</div>
          <div class="note">${lotNote(t, left)}</div>
        </div>
        <div class="ticket-cut" aria-hidden="true"></div>
        <div class="ticket-action">
          ${left === 0 ? lotBadge(t) : `
            <div class="stepper" data-id="${escapeHtml(t.id)}">
              <button type="button" data-step="-1" aria-label="Quitar una entrada ${escapeHtml(t.name)}">−</button>
              <output aria-live="polite">0</output>
              <button type="button" data-step="1" aria-label="Agregar una entrada ${escapeHtml(t.name)}">+</button>
            </div>`}
        </div>
      </div>`;
  }).join("");

  // Precio "desde" de lo que está a la venta ahora.
  const onSale = event.ticketTypes.filter((t) => available(t) > 0);
  const from = onSale.length ? Math.min(...onSale.map((t) => t.priceCents)) : null;
  const start = new Date(event.startsAt);
  const longDate = dayFormatter.format(start);
  const { time } = dateParts(event.startsAt);
  const flyerUrl = event.imageFile ? `/media/${encodeURIComponent(event.imageFile)}` : null;
  const icon = (path) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

  content.innerHTML = `
    <section class="event-hero">
      ${flyerUrl ? `<div class="backdrop" style="background-image: url('${flyerUrl}')"></div>` : ""}
      <div class="container">
        <div class="poster-wrap">
          ${flyerUrl ? `<div class="poster-glow" style="background-image: url('${flyerUrl}')" aria-hidden="true"></div>` : ""}
          <div class="poster">${eventImage(event, `Flyer de ${event.name}`)}</div>
        </div>
        <div class="hero-info">
          ${event.organizer ? `<a class="organizer-chip" href="/organizador.html?id=${encodeURIComponent(event.organizer.id)}"><span class="avatar" aria-hidden="true">${escapeHtml(event.organizer.name.trim().charAt(0).toUpperCase())}</span>${escapeHtml(event.organizer.name)} <span class="faint">presenta</span></a>` : ""}
          <h1>${escapeHtml(event.name)}</h1>
          <ul class="facts">
            <li>${icon('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>')}<div><span>Fecha</span><strong>${escapeHtml(longDate.charAt(0).toUpperCase() + longDate.slice(1))}</strong></div></li>
            <li>${icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}<div><span>Hora</span><strong>${escapeHtml(time)} h</strong></div></li>
            <li>${icon('<path d="M12 21.5s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9.5" r="2.5"/>')}<div><span>Lugar</span><strong>${escapeHtml(event.venue)}</strong>${event.address ? `<em>${escapeHtml(event.address)}</em>` : ""}</div></li>
          </ul>
          <div class="hero-cta">
            ${allSoldOut
              ? `<div class="from"><span>Entradas</span><strong>${allEnded ? "Venta finalizada" : "Agotadas"}</strong></div>`
              : `<div class="from"><span>${from === 0 ? "Entrada" : "Desde"}</span><strong>${from === 0 ? "Gratis" : formatPrice(from)}</strong></div>
                 <a class="btn btn-gradient" href="#entradas">Comprar entradas</a>`}
            <button type="button" class="btn btn-secondary share-button" id="share">
              ${icon('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>')}
              <span>Compartir</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <main class="container" style="padding-top: 0">
      <div class="checkout">
        <div class="event-main">
          <section class="card" id="entradas">
            <h2>Entradas</h2>
            ${allSoldOut ? `<p class="error">${allEnded ? "La venta de entradas para este evento terminó." : "Las entradas para este evento están agotadas."}</p>` : ""}
            <div class="ticket-list">${options}</div>
          </section>

          ${event.description ? `
          <section class="card about">
            <h2>Sobre el evento</h2>
            <p class="description">${escapeHtml(event.description)}</p>
          </section>` : ""}

          ${event.map ? `
          <section class="card map-card">
            <div class="map-head">
              <div>
                <h2>Cómo llegar</h2>
                <p class="muted" style="margin: 0">${escapeHtml(event.venue)} · ${escapeHtml(event.address)}</p>
              </div>
              <a class="btn btn-secondary" href="${escapeHtml(event.map.directionsUrl)}" target="_blank" rel="noopener">Abrir en Google Maps</a>
            </div>
            <div class="map-frame">
              <iframe src="${escapeHtml(event.map.embedUrl)}" title="Mapa de ${escapeHtml(event.venue)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
            </div>
          </section>` : ""}
        </div>

        <form class="card summary" id="checkout" ${allSoldOut ? "hidden" : ""}>
          <h2>Tu compra</h2>
          <ul class="lines" id="lines"><li class="faint">Elegí tus entradas.</li></ul>
          <div class="total-line"><span>Total</span><span class="amount" id="total">${formatPrice(0)}</span></div>
          <label for="name">Nombre y apellido</label>
          <input id="name" required maxlength="100" autocomplete="name">
          <label for="email">Email</label>
          <input id="email" type="email" required maxlength="200" autocomplete="email">
          <p class="field-hint">Hasta ${MAX_TICKETS} entradas por compra. Tenés 15 minutos para pagar; después las entradas se liberan.</p>
          <p class="field-hint">Al comprar aceptás los <a href="/terminos.html" target="_blank">Términos y condiciones</a>, la <a href="/privacidad.html" target="_blank">Política de privacidad</a> y la <a href="/devoluciones.html" target="_blank">Política de devoluciones</a>.</p>
          <button type="submit" class="btn btn-gradient btn-block" id="buy" style="margin-top: 16px" disabled>Comprar</button>
          <p id="message" class="error" role="alert" style="margin: 12px 0 0"></p>
        </form>
      </div>
    </main>

    <div class="mobile-bar" id="mobile-bar" ${allSoldOut ? "hidden" : ""}>
      <div><div class="faint small">Total</div><div class="amount" id="mobile-total">${formatPrice(0)}</div></div>
      <button type="button" class="btn btn-gradient" id="mobile-continue" disabled>Continuar</button>
    </div>`;

  const byId = new Map(event.ticketTypes.map((t) => [t.id, t]));
  const totalQuantity = () => [...quantities.values()].reduce((a, b) => a + b, 0);

  function update() {
    const count = totalQuantity();
    let total = 0;
    const lines = [];
    for (const [id, qty] of quantities) {
      if (!qty) continue;
      const t = byId.get(id);
      total += qty * t.priceCents;
      lines.push(`<li><span>${qty} × ${escapeHtml(t.name)}</span><span>${formatPrice(qty * t.priceCents)}</span></li>`);
    }
    const fee = serviceFee(total, event.serviceFeePercent ?? 0);
    if (fee > 0) lines.push(`<li class="muted"><span>Cargo por servicio</span><span>${formatPrice(fee)}</span></li>`);
    total += fee;
    document.getElementById("lines").innerHTML = lines.join("") || '<li class="faint">Elegí tus entradas.</li>';
    document.getElementById("total").textContent = formatPrice(total);
    document.getElementById("mobile-total").textContent = formatPrice(total);
    document.getElementById("buy").disabled = count === 0;
    document.getElementById("mobile-continue").disabled = count === 0;

    for (const stepper of content.querySelectorAll(".stepper")) {
      const t = byId.get(stepper.dataset.id);
      const qty = quantities.get(t.id);
      stepper.querySelector("output").textContent = qty;
      stepper.closest(".ticket-option").classList.toggle("selected", qty > 0);
      stepper.querySelector('[data-step="-1"]').disabled = qty === 0;
      stepper.querySelector('[data-step="1"]').disabled = qty >= available(t) || count >= MAX_TICKETS;
    }
  }

  content.addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]");
    if (!step) return;
    const id = step.closest(".stepper").dataset.id;
    quantities.set(id, Math.max(0, quantities.get(id) + Number(step.dataset.step)));
    update();
  });

  // Compartir: en el celular abre el menú de compartir (WhatsApp, Instagram…); si no, copia el link.
  document.getElementById("share").addEventListener("click", async (e) => {
    const button = e.currentTarget;
    const url = `${location.origin}/evento.html?id=${encodeURIComponent(event.id)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.name, text: `${event.name} · ${formatDate(event.startsAt)} h`, url });
      } catch {
        // cancelado
      }
      return;
    }
    const label = button.querySelector("span");
    try {
      await navigator.clipboard.writeText(url);
      label.textContent = "¡Link copiado!";
    } catch {
      label.textContent = url;
    }
    setTimeout(() => (label.textContent = "Compartir"), 2500);
  });

  document.getElementById("mobile-continue").addEventListener("click", () => {
    document.getElementById("checkout").scrollIntoView({ behavior: "smooth" });
    document.getElementById("name").focus({ preventScroll: true });
  });

  document.getElementById("checkout").addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = document.getElementById("message");
    const items = [...quantities].filter(([, qty]) => qty > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    if (items.length === 0) {
      message.textContent = "Elegí al menos una entrada.";
      return;
    }
    const button = document.getElementById("buy");
    button.disabled = true;
    button.textContent = "Reservando…";
    message.textContent = "";
    try {
      const order = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          buyerName: document.getElementById("name").value,
          buyerEmail: document.getElementById("email").value,
          items,
        }),
      });
      // La orden se ve con su clave secreta, que viaja en el #fragmento del link.
      location.href = `/orden.html#${encodeURIComponent(order.id)}.${encodeURIComponent(order.accessToken)}`;
    } catch (err) {
      message.textContent = err.message;
      button.disabled = false;
      button.textContent = "Comprar";
    }
  });

  update();
}

try {
  if (!eventId) throw new Error("No se indicó el evento.");
  render(await api(`/events/${encodeURIComponent(eventId)}`));
} catch (err) {
  content.innerHTML = `
    <main class="container">
      <div class="empty">
        <p class="error">${escapeHtml(err.message)}</p>
        <a class="btn btn-secondary" href="/">Ver otros eventos</a>
      </div>
    </main>`;
}
