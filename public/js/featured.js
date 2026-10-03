import { escapeHtml, eventImage } from "/js/common.js";

// Carrusel de la portada con los flyers de todos los eventos, en bucle: el del centro se ve
// grande y los de al lado más chicos. Cambia solo cada 5 segundos; también con las flechas,
// tocando un flyer de costado o deslizando con el dedo.

const INTERVAL = 5000;
const VISIBLE = 2; // flyers a cada lado del central

export function renderFeatured(root, events) {
  if (events.length === 0) return;
  const stage = root.querySelector(".featured-stage");
  stage.innerHTML = events
    .map(
      (e) => `
      <a class="featured-slide" href="/evento.html?id=${encodeURIComponent(e.id)}" aria-label="${escapeHtml(e.name)}">
        ${e.imageFile ? `<img src="/media/${encodeURIComponent(e.imageFile)}" alt="${escapeHtml(e.name)}">` : eventImage(e)}
      </a>`,
    )
    .join("");
  root.hidden = false;
  const slides = [...stage.children];
  const total = slides.length;
  root.classList.toggle("single", total === 1);
  let current = 0;
  let previous = new Map();

  // Distancia de cada flyer al central, dando la vuelta (el último queda a la izquierda del primero).
  const offset = (i) => {
    let d = (i - current) % total;
    if (d > total / 2) d -= total;
    if (d < -total / 2) d += total;
    return d;
  };

  function layout() {
    slides.forEach((slide, i) => {
      const d = offset(i);
      // El que da la vuelta de un costado al otro salta sin animación (no cruza por delante).
      const jumped = previous.has(i) && Math.abs(previous.get(i) - d) > 1;
      slide.classList.toggle("no-anim", jumped);
      slide.style.setProperty("--d", d);
      slide.dataset.pos = d === 0 ? "center" : Math.abs(d) <= VISIBLE ? `side${Math.abs(d)}` : "hidden";
      slide.tabIndex = d === 0 ? 0 : -1;
      slide.setAttribute("aria-hidden", String(d !== 0));
      previous.set(i, d);
    });
    requestAnimationFrame(() => slides.forEach((s) => s.classList.remove("no-anim")));
  }

  const go = (i) => {
    current = (i + total) % total;
    layout();
    restart();
  };

  // Un flyer de costado no abre el evento: lo trae al centro.
  stage.addEventListener("click", (e) => {
    const slide = e.target.closest(".featured-slide");
    if (!slide) return;
    const i = slides.indexOf(slide);
    if (i !== current) {
      e.preventDefault();
      go(i);
    }
  });
  root.querySelector(".featured-nav.prev").addEventListener("click", () => go(current - 1));
  root.querySelector(".featured-nav.next").addEventListener("click", () => go(current + 1));

  // Deslizar con el dedo.
  let startX = null;
  stage.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
  });

  // Pasa solo, salvo con el mouse encima o si la persona prefiere menos movimiento.
  let timer = null;
  let hovering = false;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function restart() {
    clearInterval(timer);
    if (reduceMotion || total === 1) return;
    timer = setInterval(() => {
      if (!hovering && !document.hidden) go(current + 1);
    }, INTERVAL);
  }
  root.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && (hovering = true));
  root.addEventListener("pointerleave", () => (hovering = false));

  layout();
  restart();
}
