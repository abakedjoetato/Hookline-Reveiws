import { Request } from "express";
import { AuthenticatedUser } from "@platform/auth";

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
  /** Id of the UserSession that authenticated this request. */
  sessionId?: string;
}
