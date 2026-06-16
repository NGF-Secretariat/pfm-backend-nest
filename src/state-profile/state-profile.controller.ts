import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, HttpException, HttpStatus } from '@nestjs/common';
import { StateProfileService } from './state-profile.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('state-profile')
export class StateProfileController {
    constructor(private readonly stateProfileService: StateProfileService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadStates(
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) {
            throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
        }
        return this.stateProfileService.uploadStateProfiles(file);
    }

    @Get()
    async findAll() {
        return this.stateProfileService.getAllStateProfiles();
    }

    @Get(':slug')
    async findOne(@Param('slug') slug: string) {
        return this.stateProfileService.getProfileBySlug(slug);
    }

    @Patch(':slug')
    async update(@Param('slug') slug: string, @Body() updateData: any) {
        // In a real application we would validate updateData with DTOs
        return this.stateProfileService.updateProfileBySlug(slug, updateData);
    }

    @Delete(':slug')
    async remove(@Param('slug') slug: string) {
        return this.stateProfileService.deleteProfileBySlug(slug);
    }
}
