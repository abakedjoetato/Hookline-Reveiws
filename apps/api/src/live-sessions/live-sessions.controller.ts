import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { LiveSessionsService } from "./live-sessions.service";
import {
  CreateLiveSessionDto,
  ExpectedQueueRevisionDto,
  AddQueueEntryDto,
} from "./dto/live-session.dto";
import { SessionGuard } from "../auth/guards/session.guard";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";

@Controller("live-sessions")
@UseGuards(SessionGuard)
export class LiveSessionsController {
  constructor(private readonly liveSessionsService: LiveSessionsService) {}

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateLiveSessionDto,
  ) {
    return this.liveSessionsService.createLiveSession(req.user.id, dto);
  }

  @Get(":id")
  async get(@Req() req: RequestWithUser, @Param("id") id: string) {
    return this.liveSessionsService.getLiveSession(req.user.id, id);
  }

  @Post(":id/start")
  async start(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: ExpectedQueueRevisionDto,
  ) {
    return this.liveSessionsService.startLiveSession(req.user.id, id, dto.expectedQueueRevision);
  }

  @Post(":id/pause")
  async pause(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: ExpectedQueueRevisionDto,
  ) {
    return this.liveSessionsService.pauseLiveSession(req.user.id, id, dto.expectedQueueRevision);
  }

  @Post(":id/resume")
  async resume(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: ExpectedQueueRevisionDto,
  ) {
    return this.liveSessionsService.resumeLiveSession(req.user.id, id, dto.expectedQueueRevision);
  }

  @Post(":id/end")
  async end(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: ExpectedQueueRevisionDto,
  ) {
    return this.liveSessionsService.endLiveSession(req.user.id, id, dto.expectedQueueRevision);
  }

  @Post(":id/queue/entries")
  async addQueueEntry(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: AddQueueEntryDto,
  ) {
    return this.liveSessionsService.addQueueEntry(req.user.id, id, dto);
  }

  @Get(":id/queue")
  async getQueue(@Req() req: RequestWithUser, @Param("id") id: string) {
    return this.liveSessionsService.getQueue(req.user.id, id);
  }
}
