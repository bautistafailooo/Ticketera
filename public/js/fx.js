// Efecto "eco" de la portada: ondas que se expanden desde un punto, como un sonido
// que rebota, y líneas de audio que ondulan abajo. Se dibuja en un <canvas>.

const COLORS = ["255, 77, 141", "179, 92, 255", "107, 123, 255"];

export function startEcho(canvas) {
  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let rings = [];
  let lastSpawn = 0;
  let spawnCount = 0;
  let frame = null;
  // Origen de las ondas; sigue un poco al mouse para darle profundidad.
  const origin = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function baseOrigin() {
    const narrow = width < 700;
    return { x: width * (narrow ? 0.82 : 0.76), y: height * (narrow ? 0.22 : 0.42) };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { x, y } = baseOrigin();
    origin.x = origin.targetX = x;
    origin.y = origin.targetY = y;
  }

  function spawn(radius = 0) {
    rings.push({ radius, color: COLORS[spawnCount++ % COLORS.length], width: 1 + Math.random() * 1.5 });
  }

  function drawRings(dt) {
    const maxRadius = Math.hypot(width, height) * 0.75;
    for (const ring of rings) {
      ring.radius += dt * 0.06;
      const life = 1 - ring.radius / maxRadius;
      if (life <= 0) continue;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, ring.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ring.color}, ${0.55 * life * life})`;
      ctx.lineWidth = ring.width;
      ctx.stroke();
    }
    rings = rings.filter((ring) => ring.radius < maxRadius);

    // Núcleo que late en el origen.
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 420);
    const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 60);
    glow.addColorStop(0, `rgba(255, 77, 141, ${0.35 * pulse})`);
    glow.addColorStop(1, "rgba(255, 77, 141, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(origin.x - 60, origin.y - 60, 120, 120);
  }

  function drawWaves(time) {
    // Pegadas al borde de abajo, para no pasar por encima del buscador.
    const baseY = height - 26;
    for (let w = 0; w < 3; w++) {
      ctx.beginPath();
      for (let x = 0; x <= width; x += 6) {
        // Suma de senos con una envolvente, para que parezca una onda de audio.
        const envelope = Math.sin((x / width) * Math.PI);
        const y =
          baseY +
          envelope *
            (Math.sin(x * 0.012 + time * 0.0011 * (w + 1)) * 14 +
              Math.sin(x * 0.031 - time * 0.0017) * 6) *
            (1 - w * 0.25);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${COLORS[w]}, ${0.35 - w * 0.08})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  let last = performance.now();
  function tick(now) {
    // El primer cuadro puede llegar con una marca de tiempo anterior a "last".
    const dt = Math.max(0, Math.min(now - last, 50));
    last = now;
    origin.x += (origin.targetX - origin.x) * 0.04;
    origin.y += (origin.targetY - origin.y) * 0.04;
    if (now - lastSpawn > 1300) {
      spawn();
      lastSpawn = now;
    }
    ctx.clearRect(0, 0, width, height);
    drawRings(dt);
    drawWaves(now);
    frame = requestAnimationFrame(tick);
  }

  function drawStill() {
    ctx.clearRect(0, 0, width, height);
    rings = [];
    for (let i = 0; i < 7; i++) spawn(60 + i * 90);
    drawRings(0);
    drawWaves(0);
  }

  resize();
  new ResizeObserver(() => {
    resize();
    if (reduceMotion) drawStill();
  }).observe(canvas);

  if (reduceMotion) {
    drawStill();
    return;
  }

  // Arranca con algunas ondas ya en camino para que no se vea vacío.
  for (let i = 0; i < 5; i++) spawn(i * 110);

  canvas.parentElement.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const { x, y } = baseOrigin();
    origin.targetX = x + ((e.clientX - rect.left) / rect.width - 0.5) * 80;
    origin.targetY = y + ((e.clientY - rect.top) / rect.height - 0.5) * 60;
  });

  // Sin gastar batería cuando la pestaña no se ve.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
    } else {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  });
  frame = requestAnimationFrame(tick);
}
