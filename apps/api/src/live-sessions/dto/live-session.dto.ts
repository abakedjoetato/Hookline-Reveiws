import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsUUID } from "class-validator";
import { StreamingPlatform } from "@platform/types";

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
