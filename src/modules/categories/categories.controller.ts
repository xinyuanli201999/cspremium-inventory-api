import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReorderItemsDto } from '../../common/dto/reorder.dto';
import { Actor } from '../../common/types/auth.types';
import { CategoriesService } from './categories.service';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    return this.service.findAll(query);
  }

  // NOTE: must be declared before ':id' routes so "reorder" is not read as an id
  @Roles(Role.ADMIN)
  @Patch('reorder')
  reorder(@Body() dto: ReorderItemsDto, @CurrentActor() actor: Actor) {
    return this.service.reorder(dto, actor);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentActor() actor: Actor) {
    return this.service.create(dto, actor);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.service.remove(id, actor);
  }
}
