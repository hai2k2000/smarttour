import { PartialType } from '@nestjs/swagger';
import { CreateTourProgramDto } from './create-tour-program.dto';

export class UpdateTourProgramDto extends PartialType(CreateTourProgramDto) {}
