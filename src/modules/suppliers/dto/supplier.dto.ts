import { PartialType } from '@nestjs/mapped-types';
import { Status } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmptyToNull, OptionalString } from '../../../common/decorators/optional-string.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateSupplierDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(1) @MaxLength(200)
  companyName!: string;

  @OptionalString(120)
  contactPerson?: string | null;

  @OptionalString(40)
  phone?: string | null;

  @EmptyToNull() @IsOptional() @IsEmail() @MaxLength(200)
  email?: string | null;

  @OptionalString(500)
  address?: string | null;

  @OptionalString(1000)
  note?: string | null;

  @IsOptional() @IsEnum(Status)
  status?: Status;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class SupplierQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(Status) status?: Status;
}
