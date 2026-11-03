import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Status, Unit } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OptionalString } from '../../../common/decorators/optional-string.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateProductDto {
  @trim() @IsString() @MinLength(1) @MaxLength(60)
  sku!: string;

  @trim() @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @OptionalString(200)
  nameKh?: string | null;

  @IsUUID()
  categoryId!: string;

  @IsOptional() @IsUUID()
  subcategoryId?: string | null;

  @IsOptional() @IsUUID()
  supplierId?: string | null;

  @OptionalString(100)
  brand?: string | null;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  purchasePrice!: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  sellingPrice!: number;

  @Type(() => Number) @IsInt() @Min(0)
  minimumStock!: number;

  @IsEnum(Unit)
  unit!: Unit;

  @OptionalString(500)
  image?: string | null;

  @OptionalString(2000)
  description?: string | null;

  @IsOptional() @IsEnum(Status)
  status?: Status;

  /** Opening stock. Recorded as a Stock In movement so history stays complete. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  initialStock?: number;
}

/** Stock can only change through Stock In / Out / Adjustment, never by editing a product. */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['initialStock'] as const),
) {}

export const PRODUCT_SORT_FIELDS = [
  'name',
  'sku',
  'purchasePrice',
  'sellingPrice',
  'currentStock',
  'createdAt',
] as const;

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() subcategoryId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsEnum(Status) status?: Status;

  /** low = 0 < stock <= minimum, out = stock 0 */
  @IsOptional() @IsIn(['low', 'out']) stock?: 'low' | 'out';

  @IsOptional() @IsIn(PRODUCT_SORT_FIELDS)
  sortBy: (typeof PRODUCT_SORT_FIELDS)[number] = 'createdAt';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
