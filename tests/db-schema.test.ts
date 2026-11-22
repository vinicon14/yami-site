import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "../lib/db/sql-shared";
import type { Store } from "../lib/db/types";

describe("schema ampliado", () => {
  it("contém tabelas de solicitações, avisos e eventos de pagamento", () => {
    for (const table of ["feature_requests", "feature_request_events", "user_notifications", "payment_events"]) {
      expect(SCHEMA_SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("expõe os métodos necessários no contrato Store", () => {
    const methods: Array<keyof Store> = [
      "markPaidOnce",
      "addPaymentEvent",
      "createFeatureRequest",
      "listFeatureRequests",
      "getFeatureRequest",
      "updateFeatureRequest",
      "transitionFeatureRequest",
      "createUserNotification",
      "listUserNotifications",
      "markNotificationRead",
      "countUnreadNotifications",
    ];
    expect(methods.length).toBe(11);
  });
});
