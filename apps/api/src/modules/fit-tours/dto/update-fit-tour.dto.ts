import { PartialType } from '@nestjs/swagger';
import { CreateFitTourDto, FIT_TOUR_CREATE_FIELDS } from './create-fit-tour.dto';

export class UpdateFitTourDto extends PartialType(CreateFitTourDto) {}

export const FIT_TOUR_UPDATE_FIELDS = FIT_TOUR_CREATE_FIELDS;
