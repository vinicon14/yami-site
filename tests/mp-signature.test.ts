import { describe, expect, it } from "vitest";
import {
  buildManifest,
  computeSignatureHex,
  parseSignatureHeader,
  verifyMercadoPagoSignature,
} from "../lib/mp-signature";

const SECRET = "test-webhook-secret-not-real";

function sign(dataId: string, requestId: string, ts: string, secret = SECRET) {
  const manifest = buildManifest(dataId, requestId, ts);
  const v1 = computeSignatureHex(manifest, secret);
  return { header: `ts=${ts},v1=${v1}`, v1, manifest };
}

describe("parseSignatureHeader", () => {
  it("lê ts e um ou mais v1", () => {
    const parsed = parseSignatureHeader("ts=1704908010,v1=abc,v1=def");
    expect(parsed).toEqual({ ts: "1704908010", v1: ["abc", "def"] });
  });

  it("rejeita cabeçalho vazio ou sem v1", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("ts=1")).toBeNull();
    expect(parseSignatureHeader("v1=abc")).toBeNull();
  });
});

describe("buildManifest", () => {
  it("mantém id numérico como está", () => {
    expect(buildManifest("1234567890", "req-1", "111")).toBe(
      "id:1234567890;request-id:req-1;ts:111;",
    );
  });

  it("passa id alfanumérico para minúsculas", () => {
    expect(buildManifest("AbCdef123", "req-1", "111")).toBe(
      "id:abcdef123;request-id:req-1;ts:111;",
    );
  });
});

describe("verifyMercadoPagoSignature", () => {
  const dataId = "123456789";
  const requestId = "a1b2c3d4-e5f6";
  const ts = "1704908010";

  it("aceita uma assinatura válida", () => {
    const { header } = sign(dataId, requestId, ts);
    const result = verifyMercadoPagoSignature({
      xSignature: header,
      xRequestId: requestId,
      dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: true, ts });
  });

  it("aceita id alfanumérico com caixa diferente", () => {
    const id = "PayMentXY9";
    const { header } = sign(id, requestId, ts);
    const result = verifyMercadoPagoSignature({
      xSignature: header,
      xRequestId: requestId,
      dataId: "PAYMENTXY9",
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("rejeita assinatura com segredo errado", () => {
    const { header } = sign(dataId, requestId, ts);
    const result = verifyMercadoPagoSignature({
      xSignature: header,
      xRequestId: requestId,
      dataId,
      secret: "outro-segredo",
    });
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejeita assinatura adulterada", () => {
    const { v1 } = sign(dataId, requestId, ts);
    const result = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1.replace(/[0-9a-f]/, "0")}`,
      xRequestId: requestId,
      dataId,
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita request-id ou data.id trocados", () => {
    const { header } = sign(dataId, requestId, ts);
    expect(
      verifyMercadoPagoSignature({
        xSignature: header,
        xRequestId: "outro",
        dataId,
        secret: SECRET,
      }).ok,
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        xSignature: header,
        xRequestId: requestId,
        dataId: "000",
        secret: SECRET,
      }).ok,
    ).toBe(false);
  });

  it("rejeita cabeçalhos ausentes ou segredo vazio", () => {
    expect(
      verifyMercadoPagoSignature({
        xSignature: null,
        xRequestId: requestId,
        dataId,
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: "missing_signature" });
    expect(
      verifyMercadoPagoSignature({
        xSignature: "ts=1,v1=aa",
        xRequestId: null,
        dataId,
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: "missing_request_id" });
    expect(
      verifyMercadoPagoSignature({
        xSignature: "ts=1,v1=aa",
        xRequestId: requestId,
        dataId: "",
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: "missing_data_id" });
    expect(
      verifyMercadoPagoSignature({
        xSignature: "ts=1,v1=aa",
        xRequestId: requestId,
        dataId,
        secret: "",
      }),
    ).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("rejeita ts velho quando maxAgeSec está ativo", () => {
    const { header } = sign(dataId, requestId, ts);
    const result = verifyMercadoPagoSignature({
      xSignature: header,
      xRequestId: requestId,
      dataId,
      secret: SECRET,
      maxAgeSec: 300,
      nowSec: Number(ts) + 400,
    });
    expect(result).toEqual({ ok: false, reason: "expired_ts" });
  });

  it("aceita ts dentro da janela", () => {
    const { header } = sign(dataId, requestId, ts);
    const result = verifyMercadoPagoSignature({
      xSignature: header,
      xRequestId: requestId,
      dataId,
      secret: SECRET,
      maxAgeSec: 300,
      nowSec: Number(ts) + 10,
    });
    expect(result.ok).toBe(true);
  });
});
