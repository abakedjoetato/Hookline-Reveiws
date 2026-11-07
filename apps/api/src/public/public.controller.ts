import { Controller, Get, NotFoundException, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PublicService } from "./public.service";
import { SiteCustomizationService } from "./site-customization.service";

/**
 * Unauthenticated endpoints (no SessionGuard): /api/v1/theme/public,
 * /stations, /stations/:hostname, /overlay/:hostname, /profile/:username
 * and /media/public/* for uploaded branding images.
 */
@Controller()
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly customization: SiteCustomizationService,
  ) {}

  @Get("theme/public")
  getTheme() {
    return this.customization.getPublic();
  }

  @Get("stations")
  listStations() {
    return this.publicService.listStations();
  }

  @Get("stations/:hostname")
  getStation(@Param("hostname") hostname: string) {
    return this.publicService.getStation(hostname);
  }

  @Get("stations/:hostname/weekly-top3")
  getWeeklyTop3(@Param("hostname") hostname: string, @Query("date") date?: string) {
    return this.publicService.getWeeklyTop3(hostname, date);
  }

  @Get("overlay/:hostname")
  getOverlay(@Param("hostname") hostname: string) {
    return this.publicService.getOverlay(hostname);
  }

  @Get("profile/:username")
  getProfile(@Param("username") username: string) {
    return this.publicService.getProfile(username);
  }

  /** Redirects to a short-lived storage link for an uploaded logo, favicon or artwork. */
  @Get("media/public/*")
  async getPublicMedia(@Req() req: Request, @Res() res: Response) {
    const objectKey = String((req.params as Record<string, string>)[0] ?? "");
    const url = await this.customization.resolvePublicAsset(objectKey);
    if (!url) throw new NotFoundException("Asset not found");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.redirect(302, url);
  }
}
