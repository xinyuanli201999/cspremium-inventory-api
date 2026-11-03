import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Optional trimmed string. Empty strings become null so a form can clear a field.
 */
export function OptionalString(max = 255) {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' ? value.trim() || null : value,
    ),
    IsOptional(),
    IsString(),
    MaxLength(max),
  );
}

/** Same null-for-empty transform, for use before other validators (e.g. @IsEmail). */
export const EmptyToNull = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );
