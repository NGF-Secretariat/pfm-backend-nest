import { PartialType } from '@nestjs/mapped-types';
import { CreateLandingPageDto } from './create-landing-page.dto';

export class UpdateLandingPageDto extends PartialType(CreateLandingPageDto) {}
