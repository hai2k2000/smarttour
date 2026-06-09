import { PartialType } from '@nestjs/swagger';
import { CreateGitTourDto, GIT_TOUR_CREATE_FIELDS } from './create-git-tour.dto';

export class UpdateGitTourDto extends PartialType(CreateGitTourDto) {}

export const GIT_TOUR_UPDATE_FIELDS = GIT_TOUR_CREATE_FIELDS;
