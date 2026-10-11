import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseFilters } from "@nestjs/common";
import { SessionService } from "../auth/services/session.service";
import { parse as parseCookie } from "cookie";
import { LiveSessionsService } from "./live-sessions.service";
import { PrismaClient } from "@platform/database";
import { LiveSessionsEventService } from "./live-sessions-event.service";
import { SESSION_COOKIE_NAME } from "../auth/services/cookie.service";

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    // Cookies authenticate the socket, so only our own web origins may connect
    origin: allowedOrigins,
    credentials: true,
  },
})
export class LiveSessionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly sessionService: SessionService,
    private readonly liveSessionsService: LiveSessionsService,
    private readonly prisma: PrismaClient,
    private readonly eventsService: LiveSessionsEventService
  ) {
    // Everyone in a session (host included) is in the PUBLIC room, so one
    // emit reaches all of them exactly once. With the Redis adapter this also
    // reaches clients connected to other API instances.
    this.eventsService.events$.subscribe((event) => {
      this.server?.to(`session:PUBLIC:${event.sessionId}`).emit(event.type, event.payload);
    });
  }

  async handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers.authorization;
      const cookieHeader = client.handshake.headers.cookie;

      let token: string | undefined;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      } else if (cookieHeader) {
        const cookies = parseCookie(cookieHeader);
        token = cookies[SESSION_COOKIE_NAME];
      }

      if (token) {
        const user = await this.sessionService.validateSession(token);
        (client as any).user = user;
      }
    } catch (error) {
      // Anonymous connection remains valid without user context
    }
  }

  handleDisconnect(client: Socket) {
  }

  @SubscribeMessage("join-session")
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ) {
    try {
      const user = (client as any).user;
      if (!data || !data.sessionId) return { success: false, message: "Missing sessionId" };

      const sessionId = data.sessionId;

      const session = await this.prisma.liveSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found" };
      }

      const isHost = Boolean(user && session.hostId === user.id);

      client.join(`session:PUBLIC:${sessionId}`);
      if (isHost) {
        client.join(`session:HOST:${sessionId}`);
      }

      const snapshot = {
        id: session.id,
        stationId: session.stationId,
        status: session.status,
        liveTitle: session.liveTitle,
        queueRevision: session.queueRevision,
        submissionsOpen: session.submissionsOpen,
        freeLineOpen: session.freeLineOpen,
        paidSubmissionsOpen: session.paidSubmissionsOpen,
        currentQueueEntryId: session.currentQueueEntryId,
        currentTrackId: session.currentTrackId,
      };

      return { success: true, snapshot, isHost };
    } catch (error) {
      return { success: false, message: "Error joining session" };
    }
  }

}
