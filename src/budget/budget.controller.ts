import { Controller, Get, Post, Query, UseInterceptors, UploadedFile, BadRequestException, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BudgetService } from './budget.service';

@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('distinct-years')
  async getDistinctYears() {
    return this.budgetService.getDistinctYears();
  }

  @Get('map-snapshot')
  async getMapSnapshot(@Query('year') year: string, @Query('type') type: string) {
    return this.budgetService.getMapSnapshot(year, type);
  }

  @Get('time-series')
  async getTimeSeries() {
    return this.budgetService.getTimeSeries();
  }

  @Post('upload/all')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  }))
  async uploadAll(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    try {
      return await this.budgetService.uploadAll(file);
    } catch (error: any) {
      console.error(error);
      throw new BadRequestException(error.message || 'Error occurred');
    }
  }

  @Post('upload/actual')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  uploadActual(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.budgetService.uploadSpecific(file, 'ACTUAL');
  }

  @Post('upload/budget')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  uploadBudget(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.budgetService.uploadSpecific(file, 'BUDGET');
  }

  @Post('upload/local-sheet')
  async uploadLocalSheet(@Body() body: { filePath: string; sheetName: string }) {
    if (!body.filePath || !body.sheetName) {
      throw new BadRequestException('filePath and sheetName must be provided in the request body');
    }
    return this.budgetService.uploadLocalSheet(body.filePath, body.sheetName);
  }

  @Get('fetch')
  async fetch(
    @Query('year') year: string,
    @Query('type') type: string,
    @Query('state') state?: string | string[],
  ) {
    return this.budgetService.fetch(year, type, state);
  }

  @Get('fetch-pi')
  async fetchPi(
    @Query('year') year: string,
    @Query('state') state?: string | string[],
  ) {
    return this.budgetService.fetchPi(year, state);
  }
}
