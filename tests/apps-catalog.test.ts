import { describe, expect, it } from "vitest";
import { GET as appsGet } from "../app/api/apps/route";

describe("catálogo de apps", () => {
  it("exige autenticação", async () => {
    const res = await appsGet(new Request("http://localhost:3000/api/apps"));
    expect(res.status).toBe(401);
  });
});
