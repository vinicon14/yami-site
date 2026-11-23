import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as appsGet } from "../app/api/apps/route";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { storeActionLabel, toCatalogApps } from "../lib/apps-catalog";
import { PublishedAppsList } from "../components/PublishedAppsList";

describe("catálogo de apps", () => {
  it("exige autenticação", async () => {
    const res = await appsGet(new Request("http://localhost:3000/api/apps"));
    expect(res.status).toBe(401);
  });

  it("mostra app Windows com Baixar para Windows e Linux com Instalar", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "x", name: "U" });
    await store.createOrder({ id: "o1", email: "u@example.com", amountBrl: 20, userId: "u1" });
    await store.createLicense("o1", "YAMI-TESTE");
    const windows = await store.createFeatureRequest({
      userId: "u1",
      title: "YAMI Desktop",
      description: "Aplicativo de Windows",
      category: "desktop",
      fileName: "YAMI-setup.exe",
      fileSize: 100,
      fileSha256: "ab".repeat(32),
      fileBlobPathname: "apps/yami.exe",
      appVersion: "1.0.0",
      appIcon: null,
      appPlatform: "windows",
      publishedAssetUrl: "https://example.com/YAMI-setup.exe",
      publishedAt: null,
    });
    await store.transitionFeatureRequest({
      id: windows.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "publicada",
      publishedVersion: "1.0.0",
      publishedAssetUrl: "https://example.com/YAMI-setup.exe",
    });
    const linux = await store.createFeatureRequest({
      userId: "u1",
      title: "Editor",
      description: "Aplicativo Linux",
      category: "produtividade",
      fileName: "editor.AppImage",
      fileSize: 50,
      fileSha256: "cd".repeat(32),
      fileBlobPathname: "apps/editor.AppImage",
      appVersion: "1.2.0",
      appIcon: null,
      appPlatform: "linux",
      publishedAssetUrl: "https://example.com/editor.AppImage",
      publishedAt: null,
    });
    await store.transitionFeatureRequest({
      id: linux.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "publicada",
      publishedAssetUrl: "https://example.com/editor.AppImage",
    });

    const { raw } = await createSessionForUser(user);
    const res = await appsGet(new Request("http://localhost:3000/api/apps", { headers: { cookie: `yami_session=${raw}` } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const windowsApp = body.apps.find((app: { platform: string }) => app.platform === "windows");
    const linuxApp = body.apps.find((app: { platform: string }) => app.platform === "linux");
    expect(windowsApp.actionLabel).toBe("Baixar para Windows");
    expect(windowsApp.downloadUrl).toBe("https://example.com/YAMI-setup.exe");
    expect(linuxApp.actionLabel).toBe("Instalar");
    expect(storeActionLabel("windows")).toBe("Baixar para Windows");

    const html = renderToStaticMarkup(createElement(PublishedAppsList, { apps: toCatalogApps(await store.listFeatureRequests()) }));
    expect(html).toContain("Baixar para Windows");
    expect(html).toContain('href="https://example.com/YAMI-setup.exe"');
    expect(html.match(/Baixar para Windows/g)).toHaveLength(1);
  });
});
