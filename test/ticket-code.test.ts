import { describe, expect, it } from "vitest";
import { generateTicketCode, normalizeTicketCode } from "../src/ticket-code.js";

describe("códigos de entrada", () => {
  it("genera códigos legibles de 3 grupos de 4", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTicketCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });

  it("normaliza lo que se tipea a mano", () => {
    expect(normalizeTicketCode("k7qm 4xtp 9hwd")).toBe("K7QM-4XTP-9HWD");
    expect(normalizeTicketCode("K7QM4XTP9HWD")).toBe("K7QM-4XTP-9HWD");
    expect(normalizeTicketCode("K7QM-4XTP-9HWO")).toBe("K7QM-4XTP-9HW0");
    expect(normalizeTicketCode("K7QM-4XTP-9HWI")).toBe("K7QM-4XTP-9HW1");
    expect(normalizeTicketCode("K7QM-4XTP-9HWl")).toBe("K7QM-4XTP-9HW1");
    expect(normalizeTicketCode("K7QM-4XTP")).toBeNull();
    expect(normalizeTicketCode("K7QM-4XTP-9HWU")).toBeNull();
  });
});
