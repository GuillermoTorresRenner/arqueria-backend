import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { WeatherModule } from '../weather/weather.module';
import {
  ActivitiesController,
  PlacesController,
} from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PlacesService } from './places.service';

@Module({
  imports: [PrismaModule, AuthModule, EmailModule, WeatherModule],
  controllers: [ActivitiesController, PlacesController],
  providers: [ActivitiesService, PlacesService],
})
export class ActivitiesModule {}
