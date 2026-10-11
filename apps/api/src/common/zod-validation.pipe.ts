import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, z } from "zod";

/**
 * Validates and parses a request body (or query) with a Zod schema from
 * @platform/validation. Usage: `@Body(new ZodBody(schema)) body: z.infer<...>`.
 * Errors come back as 400 with a readable message and per-field details.
 */
export class ZodBody<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      const flat = result.error.flatten();
      const firstMessage =
        result.error.issues[0]?.message ?? "Request validation failed";
      throw new BadRequestException({
        message: firstMessage,
        code: "VALIDATION_FAILED",
        details: { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors },
      });
    }
    return result.data;
  }
}
