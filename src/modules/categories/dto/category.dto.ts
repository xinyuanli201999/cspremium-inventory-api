import { PartialType } from '@nestjs/mapped-types';
import { Status } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OptionalString } from '../../../common/decorators/optional-string.decorator';

export class CreateCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @OptionalString(120)
  nameKh?: string | null;

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
