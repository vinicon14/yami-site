import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "../lib/db/sql-shared";

describe("metadados de app", () => {
  it("contém os campos de arquivo", () => {
    for (const column of ["file_name", "file_size", "file_sha256", "file_blob_pathname", "app_version", "app_platform", "published_asset_url"]) {
      expect(SCHEMA_SQL).toContain(column);
    }
  });
});
