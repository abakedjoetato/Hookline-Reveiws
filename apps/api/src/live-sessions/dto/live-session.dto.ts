import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateIf,
} from "class-validator";
import { StreamingPlatform } from "@platform/types";

export enum ReorderIntent {
  TOP = "TOP",
  BOTTOM = "BOTTOM",
  BEFORE = "BEFORE",
  AFTER = "AFTER",
}

export class CreateLiveSessionDto {
  @IsUUID()
  stationId: string;

  @IsString()
  @IsNotEmpty()
  liveTitle: string;

  @IsEnum(StreamingPlatform)
  primaryStreamingPlatform: StreamingPlatform;

  @IsString()
  @IsNotEmpty()
  savedProfileUrlSnapshot: string;
}

export class ExpectedQueueRevisionDto {
  @IsNumber()
  @IsNotEmpty()
  expectedQueueRevision: number;
}

export class AddQueueEntryDto extends ExpectedQueueRevisionDto {
  @IsUUID()
  submissionId: string;
}

export class ReorderQueueEntryDto extends ExpectedQueueRevisionDto {
  @IsEnum(ReorderIntent)
  @IsNotEmpty()
  intent: ReorderIntent;

  @ValidateIf(
    (o) =>
      o.intent === ReorderIntent.BEFORE || o.intent === ReorderIntent.AFTER,
  )
  @IsUUID()
  @IsNotEmpty()
  targetEntryId?: string;
}

export interface SafeLiveSessionResponse {
  id: string;
  stationId: string;
  status: string;
  liveTitle: string;
  queueRevision: number;
}

export interface SafeSubmissionResponse {
  id: string;
  isPriority: boolean;
  currentQueueStatus: string;
  submittedAt: Date;
}

export interface SafeQueueEntryResponse {
  id: string;
  liveSessionId: string;
  status: string;
  sortOrder: number;
  priorityRank: number;
  submission: SafeSubmissionResponse;
}
