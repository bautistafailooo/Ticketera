// Lotes (preventa, tandas): cuándo se vende cada tipo de entrada.
//
// - salesEndAt: la venta de ese tipo termina en esa fecha ("Early bird hasta el viernes").
// - opensAfterId: el tipo se habilita recién cuando el otro termina, porque se agotó o venció
//   ("Primera tanda" después de "Early bird").

export type LotStatus = "onsale" | "soldout" | "ended" | "upcoming";

type LotType = { id: string; capacity: number; sold: number; salesEndAt: Date | null; opensAfterId: string | null };

export function lotStatus(type: LotType, all: LotType[], now = new Date(), seen = new Set<string>()): LotStatus {
  if (type.salesEndAt && type.salesEndAt <= now) return "ended";
  if (type.opensAfterId && !seen.has(type.id)) {
    seen.add(type.id);
    const previous = all.find((t) => t.id === type.opensAfterId);
    if (previous) {
      const status = lotStatus(previous, all, now, seen);
      if (status === "onsale" || status === "upcoming") return "upcoming";
    }
  }
  return type.sold >= type.capacity ? "soldout" : "onsale";
}

// Agrega a cada tipo su estado y el nombre del lote anterior (para mostrar "se habilita cuando termine …").
export function withLots<T extends LotType & { name: string }>(types: T[], now = new Date()) {
  return types.map((t) => ({
    ...t,
    status: lotStatus(t, types, now),
    opensAfterName: t.opensAfterId ? (types.find((o) => o.id === t.opensAfterId)?.name ?? null) : null,
  }));
}
