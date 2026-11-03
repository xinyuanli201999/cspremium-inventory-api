import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Actor } from '../../common/types/auth.types';
import {
  MovementQueryDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Post('stock-in')
  stockIn(@Body() dto: StockInDto, @CurrentActor() actor: Actor) {
    return this.service.stockIn(dto, actor);
  }

  @Post('stock-out')
  stockOut(@Body() dto: StockOutDto, @CurrentActor() actor: Actor) {
    return this.service.stockOut(dto, actor);
  }

  @Roles(Role.ADMIN)
  @Post('adjustment')
  adjust(@Body() dto: StockAdjustmentDto, @CurrentActor() actor: Actor) {
    return this.service.adjust(dto, actor);
  }

  @Get('movements')
  movements(@Query() query: MovementQueryDto) {
    return this.service.findMovements(query);
  }
}
