import { PartialType } from '@nestjs/swagger';
import { CreateLandTourDto } from './create-landtour.dto';

export class UpdateLandTourDto extends PartialType(CreateLandTourDto) {}
