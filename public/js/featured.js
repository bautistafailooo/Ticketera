import { lowestPrice, pinIcon } from "/js/cards.js";
import { dateParts, escapeHtml, eventImage, formatPrice } from "/js/common.js";

// Carrusel grande de la portada con los próximos eventos. Se desliza con el dedo
// (scroll-snap), con las flechas o con los puntos, y pasa solo cada unos segundos.

const MAX_SLIDES = 6;
const INTERVAL = 6500;

function slide(event, index, total) {
  const href = `/evento.html?id=${encodeURIComponent(event.id)}`;
  const flyer = event.imageFile ? `/media/${encodeURIComponent(event.imageFile)}` : null;
  const { weekday, day, month, time } = dateParts(event.startsAt);
  const from = lowestPrice(event);
  const price = from === null ? "Agotado" : from === 0 ? "Entrada gratis" : `<span class="from">Desde</span> ${formatPrice(from)}`;
  return `
    <article class="featured-slide" role="group" aria-roledescription="diapositiva" aria-label="${index + 1} de ${total}">
      ${flyer ? `<div class="featured-bg" style="background-image: url('${escapeHtml(flyer)}')" aria-hidden="true"></div>` : '<div class="featured-bg plain" aria-hidden="true"></div>'}
      <div class="container featured-inner">
        <a class="featured-poster" href="${href}" tabindex="-1" aria-hidden="true">${eventImage(event)}</a>
        <div class="featured-info">
          <div class="featured-when">${escapeHtml(weekday)} ${escapeHtml(day)} ${escapeHtml(month)} · ${escapeHtml(time)} h</div>
          <h2><a href="${href}">${escapeHtml(event.name)}</a></h2>
          <div class="featured-place">${pinIcon}<span>${escapeHtml(event.venue)}</span></div>
          ${event.organizer ? `<div class="featured-by">por <b>${escapeHtml(event.organizer.name)}</b></div>` : ""}
          <div class="featured-cta">
            <a class="btn btn-gradient" href="${href}">Comprar entradas</a>
            <span class="featured-price">${price}</span>
          </div>
        </div>
      </div>
    </article>`;
}

export function renderFeatured(root, events) {
  const shown = events.slice(0, MAX_SLIDES);
  if (shown.length === 0) return;
  const track = root.querySelector(".featured-track");
  const dots = root.querySelector(".featured-dots");
  track.innerHTML = shown.map((e, i) => slide(e, i, shown.length)).join("");
  dots.innerHTML = shown.map((_, i) => `<button type="button" aria-label="Ir al evento ${i + 1}"></button>`).join("");
  root.hidden = false;
  root.classList.toggle("single", shown.length === 1);
  if (shown.length === 1) return;

  let current = 0;
  const go = (i) => {
    current = (i + shown.length) % shown.length;
    track.scrollTo({ left: current * track.clientWidth, behavior: "smooth" });
  };
  const mark = () => {
    current = Math.round(track.scrollLeft / track.clientWidth);
    [...dots.children].forEach((d, i) => d.setAttribute("aria-current", String(i === current)));
  };
  mark();
  track.addEventListener("scroll", () => requestAnimationFrame(mark), { passive: true });
  dots.addEventListener("click", (e) => {
    const i = [...dots.children].indexOf(e.target);
    if (i >= 0) go(i);
  });
  root.querySelector(".featured-nav.prev").addEventListener("click", () => go(current - 1));
  root.querySelector(".featured-nav.next").addEventListener("click", () => go(current + 1));

  // Pasa solo, salvo mientras el mouse o el foco están encima, o si la persona prefiere menos movimiento.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let paused = false;
  const pause = () => (paused = true);
  const resume = () => (paused = false);
  root.addEventListener("pointerenter", pause);
  root.addEventListener("pointerleave", resume);
  root.addEventListener("focusin", pause);
  root.addEventListener("focusout", resume);
  track.addEventListener("touchstart", pause, { passive: true });
  setInterval(() => {
    if (!paused && !document.hidden) go(current + 1);
  }, INTERVAL);
}
