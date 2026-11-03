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
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Actor } from '../../common/types/auth.types';
import {
  CreateSupplierDto,
  SupplierQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  findAll(@Query() query: SupplierQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/products')
  products(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.service.products(id, query);
  }

  @Get(':id/stock-in')
  stockIn(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.service.stockInHistory(id, query);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateSupplierDto, @CurrentActor() actor: Actor) {
    return this.service.create(dto, actor);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
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
