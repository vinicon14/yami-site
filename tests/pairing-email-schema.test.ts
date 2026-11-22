import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "../lib/db/sql-shared";

describe("pairings por e-mail", () => {
  it("contém os campos de confirmação", () => {
    expect(SCHEMA_SQL).toContain("confirm_token_hash TEXT");
    expect(SCHEMA_SQL).toContain("email_sent_at TEXT");
    expect(SCHEMA_SQL).toContain("confirmed_at TEXT");
  });
});
