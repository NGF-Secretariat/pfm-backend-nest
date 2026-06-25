import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, Query, HttpException, HttpStatus } from '@nestjs/common';
import { LandingPageService } from './landing-page.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('landing-page')
export class LandingPageController {
  constructor(private readonly landingPageService: LandingPageService) { }


  @Post()
  create(@Body() createLandingPageDto: CreateLandingPageDto) {
    return this.landingPageService.create(createLandingPageDto);
  }

  @Post('subscribe')
  async subscribe(@Body('email') email: string) {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }
    return this.landingPageService.subscribe(email);
  }

  @Get('subscribers')
  async getSubscribers() {
    try {
      return await this.landingPageService.getSubscribers();
    } catch (error: any) {
      throw new HttpException(
        `Failed to retrieve subscribers: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor("file", {
    limits: {
      fileSize: 10 * 1024 * 1024,
    }
  }))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.landingPageService.uploadFile(file);
  }

  @Get('summary')
  async groupLandingPageData(@Query('year') year?: string): Promise<any> {
    // Default to the current system year (e.g. 2026) if not provided
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

    if (isNaN(targetYear)) {
      throw new HttpException('Invalid year parameter format', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.landingPageService.getGroupedDashboardData(targetYear);
    } catch (error: any) {
      throw new HttpException(
        `Failed to compile dashboard summary: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('map-budget')
  async actualMapBudget(): Promise<any> {
    try {
      return await this.landingPageService.actualMapBudget();
    } catch (error: any) {
      throw new HttpException(
        `Failed to compile dashboard summary: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('expenditure-revenue-timeseries')
  async expenditureRevenueTimeseries(): Promise<any> {
    try {
      return await this.landingPageService.expenditureRevenueTimeseries();
    } catch (error: any) {
      throw new HttpException(
        `Failed to compile dashboard summary: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('zonal-breakdown')
  async zonalBreakdown(): Promise<any> {
    try {
      return await this.landingPageService.zonalBreakdown();
    } catch (error: any) {
      throw new HttpException(
        `Failed to compile dashboard summary: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('distribution-graph')
  async distributionGraph(): Promise<any> {
    try {
      return await this.landingPageService.distributionGraph();
    } catch (error: any) {
      throw new HttpException(
        `Failed to compile dashboard summary: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  findAll() {
    return this.landingPageService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.landingPageService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateLandingPageDto: UpdateLandingPageDto) {
    return this.landingPageService.update(+id, updateLandingPageDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.landingPageService.remove(+id);
  }
}
