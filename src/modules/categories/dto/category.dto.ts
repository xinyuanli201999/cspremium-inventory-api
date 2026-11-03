import { PartialType } from '@nestjs/mapped-types';
import { Status } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OptionalString } from '../../../common/decorators/optional-string.decorator';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @OptionalString(120)
  nameKh?: string | null;

  /** Optional. Generated from the name when omitted. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @Matches(SLUG_REGEX, { message: 'slug ត្រូវជាអក្សរតូច លេខ និងសញ្ញា - ប៉ុណ្ណោះ' })
  @MaxLength(120)
  slug?: string;

  @OptionalString(500)
  description?: string | null;

  @IsOptional() @IsEnum(Status)
  status?: Status;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(Status) status?: Status;
}
