import { Controller, Get } from '@nestjs/common';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Actor } from '../../common/types/auth.types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary(@CurrentActor() actor: Actor) {
    return this.service.summary(actor);
  }

  @Get('charts')
  charts(@CurrentActor() actor: Actor) {
    return this.service.charts(actor);
  }
}
