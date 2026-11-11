import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import { Status } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReorderItemDto } from '../../../common/dto/reorder.dto';
import { OptionalString } from '../../../common/decorators/optional-string.decorator';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateSubcategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @OptionalString(120)
  nameKh?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @Matches(SLUG_REGEX, { message: 'slug must contain only lowercase letters, numbers, and hyphens' })
  @MaxLength(120)
  slug?: string;

  @OptionalString(500)
  description?: string | null;

  @IsOptional() @IsEnum(Status)
  status?: Status;
}
export class UpdateSubcategoryDto extends PartialType(CreateSubcategoryDto) {}

/**
 * Reorders the subcategories of ONE category. Items that currently belong to a
 * different category are moved into `categoryId` (drag between categories).
 */
export class ReorderSubcategoriesDto {
  @IsUUID()
  categoryId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
