import { PartialType } from '@nestjs/swagger';
import { CreateLandTourDto, LANDTOUR_CREATE_FIELDS } from './create-landtour.dto';

export class UpdateLandTourDto extends PartialType(CreateLandTourDto) {}

export const LANDTOUR_UPDATE_FIELDS = LANDTOUR_CREATE_FIELDS;
