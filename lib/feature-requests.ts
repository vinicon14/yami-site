import { FEATURE_REQUEST_STATUSES, type FeatureRequest, type FeatureRequestStatus, type Store } from "./db/types";

export type PublicFeatureRequest = Omit<FeatureRequest, "userId" | "adminNote">;

export function toPublicFeatureRequest(item: FeatureRequest): PublicFeatureRequest {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    status: item.status,
    publishedVersion: item.publishedVersion,
    fileName: item.fileName,
    fileSize: item.fileSize,
    fileSha256: item.fileSha256,
    fileBlobPathname: item.fileBlobPathname,
    appVersion: item.appVersion,
    appIcon: item.appIcon,
    appPlatform: item.appPlatform === "windows" ? "windows" : "linux",
    publishedAssetUrl: item.publishedAssetUrl,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const ADMIN_TRANSITIONS = new Set<FeatureRequestStatus>([
  "aprovada",
  "rejeitada",
  "em_desenvolvimento",
  "publicada",
]);

const VALID_STATUSES = new Set<FeatureRequestStatus>(FEATURE_REQUEST_STATUSES);

const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  pendente: "pendente",
  aprovada: "aprovada",
  rejeitada: "rejeitada",
  em_desenvolvimento: "em desenvolvimento",
  publicada: "publicada",
  retirada: "retirada",
};

const ADMIN_NOTIFICATION_TITLES: Record<FeatureRequestStatus, string> = {
  pendente: "Atualização da solicitação",
  aprovada: "Solicitação aprovada",
  rejeitada: "Solicitação rejeitada",
  em_desenvolvimento: "Solicitação em desenvolvimento",
  publicada: "Solicitação publicada",
  retirada: "Solicitação retirada",
};

export type RequestInput = {
  title: string;
  description: string;
  category: string;
  fileName?: string | null;
  fileSize?: number | null;
  fileSha256?: string | null;
  fileBlobPathname?: string | null;
  appVersion?: string | null;
  appIcon?: string | null;
  appPlatform?: "linux" | "windows" | null;
};

export type TransitionInput = {
  id: string;
  actorUserId: string;
  actorRole: "user" | "admin";
  toStatus: FeatureRequestStatus;
  note?: string | null;
  publishedVersion?: string | null;
  publishedAssetUrl?: string | null;
};

export function validateRequestInput(input: RequestInput): { ok: true } | { ok: false; reason: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  const category = input.category.trim();
  if (title.length < 3 || title.length > 120) return { ok: false, reason: "titulo_invalido" };
  if (description.length < 10 || description.length > 4000) return { ok: false, reason: "descricao_invalida" };
  if (!/^[a-z0-9_-]{2,32}$/.test(category)) return { ok: false, reason: "categoria_invalida" };
  return { ok: true };
}

export async function createRequest(store: Store, userId: string, input: RequestInput) {
  const check = validateRequestInput(input);
  if (!check.ok) throw new Error(check.reason);
  return store.createFeatureRequest({
    userId,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    fileName: input.fileName?.trim() || null,
    fileSize: input.fileSize ?? null,
    fileSha256: input.fileSha256?.trim().toLowerCase() || null,
    fileBlobPathname: input.fileBlobPathname?.trim() || null,
    appVersion: input.appVersion?.trim() || null,
    appIcon: input.appIcon?.trim() || null,
    appPlatform: input.appPlatform === "windows" ? "windows" : "linux",
    publishedAssetUrl: null,
    publishedAt: null,
  });
}

export async function transitionRequest(store: Store, input: TransitionInput) {
  if (!VALID_STATUSES.has(input.toStatus)) throw new Error("status_invalido");
  if (ADMIN_TRANSITIONS.has(input.toStatus) && input.actorRole !== "admin") {
    throw new Error("apenas administrador pode aprovar ou publicar");
  }
  if (input.toStatus === "publicada" && !/^\d+\.\d+\.\d+$/.test(input.publishedVersion ?? "")) {
    throw new Error("versao_publicacao_invalida");
  }
  if (input.actorRole !== "admin") {
    const current = await store.getFeatureRequest(input.id);
    if (!current) throw new Error("solicitacao_nao_encontrada");
    if (current.userId !== input.actorUserId) {
      throw new Error("solicitacao nao pertence ao usuario");
    }
  }

  const updated = await store.transitionFeatureRequest({
    id: input.id,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    toStatus: input.toStatus,
    note: input.actorRole === "admin" ? input.note?.slice(0, 1000) ?? null : undefined,
    // `undefined` preserves the stored version; only an explicit null clears it.
    publishedVersion: input.publishedVersion,
    publishedAssetUrl: input.publishedAssetUrl,
  });
  if (!updated) throw new Error("solicitacao_nao_encontrada");

  if (input.actorRole === "admin") {
    await store.createUserNotification({
      userId: updated.userId,
      kind: `request.${input.toStatus}`,
      title: ADMIN_NOTIFICATION_TITLES[input.toStatus],
      body: `Sua solicitação "${updated.title}" agora está ${STATUS_LABELS[input.toStatus]}.`,
      requestId: updated.id,
      expiresAt: null,
    });
  }
  return updated;
}
