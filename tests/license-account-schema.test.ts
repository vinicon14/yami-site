import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "../lib/db/sql-shared";

describe("contas vinculadas à licença", () => {
  it("contém os campos necessários", () => {
    expect(SCHEMA_SQL).toContain("status TEXT NOT NULL DEFAULT 'ativo'");
    expect(SCHEMA_SQL).toContain("license_id TEXT");
    expect(SCHEMA_SQL).toContain("user_id TEXT");
  });
});
