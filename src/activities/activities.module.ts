import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { WeatherModule } from '../weather/weather.module';
import { UploadModule } from '../upload/upload.module';
import {
  ActivitiesController,
  PlacesController,
} from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PlacesService } from './places.service';
import { GeocodingService } from './geocoding.service';
import { ActivityTournamentsService } from './activity-tournaments.service';

@Module({
  imports: [PrismaModule, AuthModule, EmailModule, WeatherModule, UploadModule],
  controllers: [ActivitiesController, PlacesController],
  providers: [
    ActivitiesService,
    PlacesService,
    GeocodingService,
    ActivityTournamentsService,
  ],
})
export class ActivitiesModule {}
