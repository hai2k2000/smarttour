import { PartialType } from '@nestjs/swagger';
import { CreateFitTourDto } from './create-fit-tour.dto';

export class UpdateFitTourDto extends PartialType(CreateFitTourDto) {}
