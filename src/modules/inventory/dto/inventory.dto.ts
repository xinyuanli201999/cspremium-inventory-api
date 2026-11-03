import { MovementType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
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

class BaseMovementDto {
  /** Optional. Generated automatically when omitted. */
  @OptionalString(60)
  referenceNo?: string | null;

  @IsUUID()
  productId!: string;

  @IsOptional() @IsDateString()
  date?: string;

  @OptionalString(1000)
  note?: string | null;
}

export class StockInDto extends BaseMovementDto {
  @IsOptional() @IsUUID()
  supplierId?: string | null;

  @Type(() => Number) @IsInt() @Min(1)
  quantity!: number;

  /** Purchase price per unit. Defaults to the product's current purchase price. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  unitCost?: number;
}

export class StockOutDto extends BaseMovementDto {
  @Type(() => Number) @IsInt() @Min(1)
  quantity!: number;

  @trim() @IsString() @MinLength(1) @MaxLength(200)
  reason!: string;

  /** Customer / department */
  @OptionalString(200)
  party?: string | null;
}

export class StockAdjustmentDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number) @IsInt() @Min(0)
  newQuantity!: number;

  @trim() @IsString() @MinLength(1) @MaxLength(200)
  reason!: string;

  @IsOptional() @IsDateString()
  date?: string;

  @OptionalString(1000)
  note?: string | null;
}

export class MovementQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(MovementType) type?: MovementType;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() subcategoryId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
