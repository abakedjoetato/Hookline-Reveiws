import { Injectable } from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { TERMS_METADATA, PRIVACY_METADATA } from "@platform/config";
import type {
  LegalAcceptanceRecord,
  LegalAcceptanceSource,
  LegalAcceptanceStatusResponse,
} from "@platform/types";

const DOC_TITLES: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  "host-agreement": "Stream Host Broadcaster Agreement",
};

export function currentLegalVersion(slug: string): string {
  if (slug === "privacy") return PRIVACY_METADATA.version;
  // Host agreement is versioned together with the Terms of Service
  return TERMS_METADATA.version;
}

type Tx = Pick<PrismaClient, "legalDocument" | "legalDocumentVersion" | "legalAcceptance">;

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaClient) {}

  private async ensureVersion(tx: Tx, slug: string, versionString: string) {
    const title = DOC_TITLES[slug] ?? slug;
    const doc = await tx.legalDocument.upsert({
      where: { slug },
      create: { id: generateUuidV7(), slug, title },
      update: {},
    });
    return tx.legalDocumentVersion.upsert({
      where: { documentId_versionString: { documentId: doc.id, versionString } },
      create: {
        id: generateUuidV7(),
        documentId: doc.id,
        versionString,
        content: `${title} version ${versionString}. Full text published at /${slug === "terms" ? "terms" : slug}.`,
      },
      update: {},
    });
  }

  /** Idempotent: accepting the same version twice returns the first record. */
  async recordAcceptance(
    params: {
      userId: string;
      documentSlug: string;
      version: string;
      source: LegalAcceptanceSource;
      ipAddress: string;
      userAgent?: string;
    },
    tx: Tx = this.prisma,
  ): Promise<LegalAcceptanceRecord> {
    const version = await this.ensureVersion(tx, params.documentSlug, params.version);
    const existing = await tx.legalAcceptance.findUnique({
      where: { userId_versionId: { userId: params.userId, versionId: version.id } },
    });
    const row =
      existing ??
      (await tx.legalAcceptance.create({
        data: {
          id: generateUuidV7(),
          userId: params.userId,
          versionId: version.id,
          acceptanceSource: params.source,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent ?? null,
        },
      }));
    return {
      id: row.id,
      userId: row.userId,
      documentSlug: params.documentSlug,
      version: params.version,
      acceptanceSource: row.acceptanceSource as LegalAcceptanceSource,
      acceptedAt: row.acceptedAt.toISOString(),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent ?? undefined,
    };
  }

  async getStatus(userId: string, documentSlug = "terms"): Promise<LegalAcceptanceStatusResponse> {
    const currentVersion = currentLegalVersion(documentSlug);
    const rows = await this.prisma.legalAcceptance.findMany({
      where: { userId, version: { document: { slug: documentSlug } } },
      include: { version: true },
      orderBy: { acceptedAt: "desc" },
    });
    const history: LegalAcceptanceRecord[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      documentSlug,
      version: r.version.versionString,
      acceptanceSource: r.acceptanceSource as LegalAcceptanceSource,
      acceptedAt: r.acceptedAt.toISOString(),
    }));
    return {
      currentVersion,
      isAccepted: history.some((h) => h.version === currentVersion),
      lastAcceptedVersion: history[0]?.version ?? null,
      lastAcceptedAt: history[0]?.acceptedAt ?? null,
      history,
    };
  }

  async hasAcceptedCurrent(userId: string, documentSlug = "terms"): Promise<boolean> {
    return (await this.getStatus(userId, documentSlug)).isAccepted;
  }
}
