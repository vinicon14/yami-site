import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import {
  ADMIN_TRANSITIONS,
  createRequest,
  transitionRequest,
  validateRequestInput,
} from "../lib/feature-requests";

describe("solicitações", () => {
  it("valida limites de texto", () => {
    expect(validateRequestInput({ title: "Tema", description: "Tema azul escolhido", category: "tema" })).toEqual({ ok: true });
    expect(validateRequestInput({ title: "a".repeat(121), description: "x", category: "tema" }).ok).toBe(false);
  });

  it("cria pendente e notifica apenas em transições administrativas", async () => {
    const store = createMemoryStore();
    await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "h" });
    const request = await createRequest(store, "u1", {
      title: "Atalho",
      description: "Criar atalho para tema",
      category: "personalizacao",
    });
    expect(request.status).toBe("pendente");
    expect(await store.countUnreadNotifications("u1")).toBe(0);

    await transitionRequest(store, {
      id: request.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "aprovada",
      note: "Aprovado",
    });
    const notes = await store.listUserNotifications("u1");
    expect(notes[0]?.kind).toBe("request.aprovada");
    expect(notes[0]?.body).toContain("aprovada");
    expect(ADMIN_TRANSITIONS.has("publicada")).toBe(true);
  });

  it("impede que usuário publique diretamente", async () => {
    const store = createMemoryStore();
    await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "h" });
    const request = await createRequest(store, "u1", {
      title: "Item",
      description: "Descrição do item",
      category: "geral",
    });
    await expect(transitionRequest(store, {
      id: request.id,
      actorUserId: "u1",
      actorRole: "user",
      toStatus: "publicada",
    })).rejects.toThrow("apenas administrador");
  });

  it("preserva publishedVersion até limpeza explícita", async () => {
    const store = createMemoryStore();
    await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "h" });
    const request = await createRequest(store, "u1", {
      title: "Publicar",
      description: "Publicar a primeira versão",
      category: "geral",
    });

    const published = await transitionRequest(store, {
      id: request.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "publicada",
      publishedVersion: "1.2.3",
    });
    expect(published.publishedVersion).toBe("1.2.3");

    const kept = await transitionRequest(store, {
      id: request.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "em_desenvolvimento",
    });
    expect(kept.publishedVersion).toBe("1.2.3");

    const cleared = await transitionRequest(store, {
      id: request.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "retirada",
      publishedVersion: null,
    });
    expect(cleared.publishedVersion).toBeNull();
  });

  it("permite que apenas administradores escrevam adminNote", async () => {
    const store = createMemoryStore();
    await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "h" });
    const request = await createRequest(store, "u1", {
      title: "Nota administrativa",
      description: "Nota escrita pelo administrador",
      category: "geral",
    });

    const approved = await transitionRequest(store, {
      id: request.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "aprovada",
      note: "Aprovado pelo administrador",
    });
    expect(approved.adminNote).toBe("Aprovado pelo administrador");

    const afterUser = await transitionRequest(store, {
      id: request.id,
      actorUserId: "u1",
      actorRole: "user",
      toStatus: "retirada",
      note: "Tentativa de sobrescrever",
    });
    expect(afterUser.adminNote).toBe("Aprovado pelo administrador");

    const other = await createRequest(store, "u1", {
      title: "Nota de usuario",
      description: "Nota enviada pelo usuario",
      category: "geral",
    });
    const userNote = await transitionRequest(store, {
      id: other.id,
      actorUserId: "u1",
      actorRole: "user",
      toStatus: "retirada",
      note: "sobrescrever",
    });
    expect(userNote.adminNote).toBeNull();
  });

  it("impede que usuario altere solicitacao de outro usuario", async () => {
    const store = createMemoryStore();
    await store.createUser({ id: "u1", email: "u1@example.com", passwordHash: "h" });
    await store.createUser({ id: "u2", email: "u2@example.com", passwordHash: "h" });
    const request = await createRequest(store, "u1", {
      title: "Alheia",
      description: "Solicitacao do primeiro usuario",
      category: "geral",
    });

    await expect(transitionRequest(store, {
      id: request.id,
      actorUserId: "u2",
      actorRole: "user",
      toStatus: "retirada",
    })).rejects.toThrow("nao pertence ao usuario");
    expect((await store.getFeatureRequest(request.id))?.status).toBe("pendente");

    const byAdmin = await transitionRequest(store, {
      id: request.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "aprovada",
    });
    expect(byAdmin.status).toBe("aprovada");
  });
});
