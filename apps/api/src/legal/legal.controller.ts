import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { recordLegalAcceptanceSchema, RecordLegalAcceptanceInput } from "@platform/validation";
import { TERMS_METADATA, PRIVACY_METADATA, getLegalConfig } from "@platform/config";
import { SessionGuard } from "../auth/guards/session.guard";
import { OptionalSession } from "../auth/decorators/auth.decorators";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { ZodBody } from "../common/zod-validation.pipe";
import { clientIp, userAgent } from "../common/request-meta";
import { LegalService, currentLegalVersion } from "./legal.service";

@Controller("legal")
@UseGuards(SessionGuard)
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @OptionalSession()
  @Get("status")
  async status(@Req() req: RequestWithUser) {
    const base = {
      termsMetadata: TERMS_METADATA,
      privacyMetadata: PRIVACY_METADATA,
      legalConfig: getLegalConfig(),
    };
    if (!req.user) {
      return {
        ...base,
        authenticated: false,
        currentVersion: TERMS_METADATA.version,
        isAccepted: false,
        lastAcceptedVersion: null,
        lastAcceptedAt: null,
        history: [],
      };
    }
    return { ...base, authenticated: true, ...(await this.legal.getStatus(req.user.id)) };
  }

  @Post("accept")
  async accept(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(recordLegalAcceptanceSchema)) body: RecordLegalAcceptanceInput,
  ) {
    const expected = currentLegalVersion(body.documentSlug);
    if (body.version !== expected) {
      throw new BadRequestException({
        message: `Version ${body.version} is not the current published version (${expected}).`,
        code: "INVALID_LEGAL_VERSION",
      });
    }
    const record = await this.legal.recordAcceptance({
      userId: req.user.id,
      documentSlug: body.documentSlug,
      version: body.version,
      source: body.acceptanceSource,
      ipAddress: clientIp(req as unknown as Request),
      userAgent: userAgent(req as unknown as Request),
    });
    return { success: true, record, currentVersion: expected, isAccepted: true };
  }
}
