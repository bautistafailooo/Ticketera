import { config } from "./config.js";

// Links de Google Maps para la dirección de un evento. No hace falta clave: con
// GOOGLE_MAPS_EMBED_KEY se usa la API oficial de mapas embebidos (gratis) en lugar del embebido simple.
export function mapLinks(address: string | null | undefined) {
  if (!address) return null;
  const q = encodeURIComponent(address);
  return {
    embedUrl: config.googleMapsEmbedKey
      ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(config.googleMapsEmbedKey)}&q=${q}&language=es`
      : `https://www.google.com/maps?q=${q}&hl=es&z=15&output=embed`,
    // Abre la app de Google Maps en el celular con el recorrido hasta el lugar.
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}
