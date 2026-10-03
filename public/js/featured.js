import { escapeHtml } from "/js/common.js";

// Carrusel de la portada: solo los flyers de los próximos eventos; cada uno lleva a su evento.
// Se desliza con el dedo (scroll-snap) o con las flechas, y avanza solo cada unos segundos.

const MAX_SLIDES = 12;
const INTERVAL = 4000;

export function renderFeatured(root, events) {
  const shown = events.filter((e) => e.imageFile).slice(0, MAX_SLIDES);
  if (shown.length === 0) return;
  const track = root.querySelector(".featured-track");
  track.innerHTML = shown
    .map(
      (e) => `
      <a class="featured-slide" href="/evento.html?id=${encodeURIComponent(e.id)}" aria-label="${escapeHtml(e.name)}">
        <img src="/media/${encodeURIComponent(e.imageFile)}" alt="${escapeHtml(e.name)}" loading="lazy">
      </a>`,
    )
    .join("");
  root.hidden = false;

  const step = () => track.firstElementChild.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || "0");
  const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  const next = () => track.scrollBy({ left: atEnd() ? -track.scrollWidth : step(), behavior: "smooth" });
  const prev = () => track.scrollBy({ left: track.scrollLeft <= 4 ? track.scrollWidth : -step(), behavior: "smooth" });
  const updateArrows = () => root.classList.toggle("fits", track.scrollWidth <= track.clientWidth + 4);
  updateArrows();
  addEventListener("resize", updateArrows);
  root.querySelector(".featured-nav.prev").addEventListener("click", prev);
  root.querySelector(".featured-nav.next").addEventListener("click", next);

  // Avanza solo, salvo con el mouse o el foco encima, después de tocarlo, o si la persona prefiere menos movimiento.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let paused = false;
  root.addEventListener("pointerenter", () => (paused = true));
  root.addEventListener("pointerleave", () => (paused = false));
  root.addEventListener("focusin", () => (paused = true));
  root.addEventListener("focusout", () => (paused = false));
  track.addEventListener("touchstart", () => (paused = true), { passive: true });
  setInterval(() => {
    if (!paused && !document.hidden && !root.classList.contains("fits")) next();
  }, INTERVAL);
}
