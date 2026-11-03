import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ReorderItemDto } from '../../../common/dto/reorder.dto';
import { CreateCategoryDto } from '../../categories/dto/category.dto';

export class CreateSubcategoryDto extends CreateCategoryDto {}
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
