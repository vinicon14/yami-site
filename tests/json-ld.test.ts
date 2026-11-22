import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "../lib/json-ld";

describe("serializeJsonLd", () => {
  it("escapes raw angle brackets", () => {
    const html = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("<");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("keeps valid JSON", () => {
    const value = { "@context": "https://schema.org", name: "YAMI", price: 20 };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });
});
