import { PartialType } from '@nestjs/swagger';
import { CreateItineraryDayDto } from './create-itinerary-day.dto';

export class UpdateItineraryDayDto extends PartialType(CreateItineraryDayDto) {}
