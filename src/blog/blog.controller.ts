import { Controller, Get, Param, Patch, Body, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { BlogService } from './blog.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('blogs')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('previousImage') previousImage?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.blogService.uploadBlogImage(file, previousImage);
  }

  @Post()
  create(@Body() createData: any) {
    return this.blogService.create(createData);
  }

  @Get()
  findAll() {
    return this.blogService.findAll();
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.blogService.findOne(slug);
  }

  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() updateData: any) {
    return this.blogService.update(slug, updateData);
  }
}
