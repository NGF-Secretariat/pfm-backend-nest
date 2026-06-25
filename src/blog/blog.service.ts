import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

function extractLocalImages(markdown: string): string[] {
  if (!markdown) return [];
  const regex = /!\[.*?\]\((.*?)\)/g;
  const images: string[] = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const url = match[1];
    if (url.startsWith('/blogs/')) {
      images.push(url);
    }
  }
  return images;
}

@Injectable()
export class BlogService {
  constructor(private prisma: PrismaService) {}

  async uploadBlogImage(file: Express.Multer.File) {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${baseName}_${Date.now()}${ext}`;

    const destDir = path.join(
      process.cwd(),
      '..',
      'pfm-frontend-next',
      'public',
      'blogs'
    );

    // Ensure directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const filePath = path.join(destDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    return { success: true, url: `/blogs/${filename}` };
  }

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

    // 1. Storage cleanup for cover image if replaced
    if (updateData.image && blog.image && updateData.image !== blog.image) {
      if (blog.image.startsWith('/blogs/')) {
        const oldImagePath = path.join(
          process.cwd(),
          '..',
          'pfm-frontend-next',
          'public',
          blog.image
        );
        try {
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        } catch (err) {
          console.error('Failed to delete replaced cover image:', err);
        }
      }
    }

    // 2. Storage cleanup for deleted inline body images
    if (updateData.content && blog.content) {
      const oldImages = extractLocalImages(blog.content);
      const newImages = extractLocalImages(updateData.content);
      const deletedImages = oldImages.filter(img => !newImages.includes(img));

      for (const img of deletedImages) {
        const imgPath = path.join(
          process.cwd(),
          '..',
          'pfm-frontend-next',
          'public',
          img
        );
        try {
          if (fs.existsSync(imgPath)) {
            fs.unlinkSync(imgPath);
          }
        } catch (err) {
          console.error(`Failed to delete removed inline image ${img}:`, err);
        }
      }
    }

    const updatedBlog = await this.prisma.blogPost.update({
      where: { slug },
      data: updateData
    });

    return { success: true, data: updatedBlog };
  }
}
