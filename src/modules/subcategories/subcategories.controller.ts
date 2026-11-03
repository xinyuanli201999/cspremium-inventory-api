import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Actor } from '../../common/types/auth.types';
import {
  CreateSubcategoryDto,
  ReorderSubcategoriesDto,
  UpdateSubcategoryDto,
} from './dto/subcategory.dto';
import { SubcategoriesService } from './subcategories.service';

@Controller()
export class SubcategoriesController {
  constructor(private readonly service: SubcategoriesService) {}

  @Get('categories/:categoryId/subcategories')
  findByCategory(@Param('categoryId', ParseUUIDPipe) categoryId: string) {
    return this.service.findByCategory(categoryId);
  }

  @Roles(Role.ADMIN)
  @Post('categories/:categoryId/subcategories')
  create(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: CreateSubcategoryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.create(categoryId, dto, actor);
  }

  // Declared before ':id' so "reorder" is not parsed as an id
  @Roles(Role.ADMIN)
  @Patch('subcategories/reorder')
  reorder(@Body() dto: ReorderSubcategoriesDto, @CurrentActor() actor: Actor) {
    return this.service.reorder(dto, actor);
  }

  @Roles(Role.ADMIN)
  @Patch('subcategories/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubcategoryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Roles(Role.ADMIN)
  @Delete('subcategories/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.service.remove(id, actor);
  }
}
