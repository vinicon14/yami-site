import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { transitionRequest } from "../lib/feature-requests";

describe("publicação de app", () => {
  it("exige versão e URL ao publicar", async () => {
    const store = createMemoryStore();
    await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "hash", name: "U", status: "ativo", licenseId: null });
    const request = await store.createFeatureRequest({ userId: "u1", title: "App", description: "Descrição do app", category: "geral" });
    await expect(transitionRequest(store, { id: request.id, actorUserId: "admin", actorRole: "admin", toStatus: "publicada" })).rejects.toThrow("versao_publicacao_invalida");
  });
});
