import { describe, expect, it } from "vitest";
import { statusLabel } from "../components/FeatureRequestsPanel";

describe("painel de solicitações", () => {
  it("usa rótulos claros para todos os estados", () => {
    expect(statusLabel("pendente")).toBe("Pendente");
    expect(statusLabel("em_desenvolvimento")).toBe("Em desenvolvimento");
    expect(statusLabel("publicada")).toBe("Publicada");
  });
});
