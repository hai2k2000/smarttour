import { PartialType } from '@nestjs/swagger';
import { CreateGitTourDto } from './create-git-tour.dto';

export class UpdateGitTourDto extends PartialType(CreateGitTourDto) {}
