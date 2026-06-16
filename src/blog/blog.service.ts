import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlogService {
  constructor(private prisma: PrismaService) {}

  async create(createData: any) {
    const blog = await this.prisma.blogPost.create({
      data: createData
    });
    return { success: true, data: blog };
  }

  async findAll() {
    const blogs = await this.prisma.blogPost.findMany({
      orderBy: { createdAt: 'asc' }
    });
    return { success: true, data: blogs };
  }

  async findOne(slug: string) {
    const blog = await this.prisma.blogPost.findUnique({
      where: { slug }
    });
    if (!blog) {
      throw new NotFoundException('Blog post not found');
    }
    return { success: true, data: blog };
  }

  async update(slug: string, updateData: any) {
    const blog = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!blog) throw new NotFoundException('Blog post not found');

    const updatedBlog = await this.prisma.blogPost.update({
      where: { slug },
      data: updateData
    });

    return { success: true, data: updatedBlog };
  }
}
