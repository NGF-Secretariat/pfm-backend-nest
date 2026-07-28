import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { Request } from 'express';
import { v2 as cloudinary } from 'cloudinary';

function extractLocalImages(markdown: string): string[] {
  if (!markdown) return [];
  const images = new Set<string>();

  // 1. Match Markdown images: ![alt](url "optional title")
  const mdRegex = /!\[.*?\]\(\s*([^\s\)]+)(?:\s+["'].*?["'])?\s*\)/g;
  let match;
  while ((match = mdRegex.exec(markdown)) !== null) {
    const url = match[1].replace(/["']/g, '').trim();
    if (url.includes('/blogs/') || url.includes('/blog/')) {
      images.add(url);
    }
  }

  // 2. Match HTML <img> tags: <img ... src="url" ...>
  const htmlRegex = /<img\s+[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/gi;
  while ((match = htmlRegex.exec(markdown)) !== null) {
    const url = match[1].replace(/["']/g, '').trim();
    if (url.includes('/blogs/') || url.includes('/blog/')) {
      images.add(url);
    }
  }

  return Array.from(images);
}

async function deleteCloudinaryImage(url: string): Promise<void> {
  if (!url) return;
  const cleanUrl = url.replace(/["']/g, '').trim();
  if (cleanUrl.includes('cloudinary.com')) {
    try {
      const parts = cleanUrl.split('/');
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex === -1) return;

      let startIndex = uploadIndex + 1;
      if (
        parts[startIndex] &&
        parts[startIndex].startsWith('v') &&
        !isNaN(Number(parts[startIndex].substring(1)))
      ) {
        startIndex++;
      }

      const remaining = parts.slice(startIndex);
      const lastPart = remaining[remaining.length - 1];
      const dotIndex = lastPart.lastIndexOf('.');
      if (dotIndex !== -1) {
        remaining[remaining.length - 1] = lastPart.substring(0, dotIndex);
      }
      const publicId = remaining.join('/');
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error(`Failed to delete Cloudinary image: ${cleanUrl}`, err);
    }
  } else if (cleanUrl.includes('/blogs/') || cleanUrl.includes('/blog/')) {
    const index = cleanUrl.includes('/blogs/') ? cleanUrl.indexOf('/blogs/') : cleanUrl.indexOf('/blog/');
    const relativePath = cleanUrl.substring(index);
    const oldImagePath = path.join(process.cwd(), 'public', relativePath);
    try {
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    } catch (err) {
      console.error(`Failed to delete local fallback image: ${cleanUrl}`, err);
    }
  }
}

@Injectable()
export class BlogService {
  constructor(private prisma: PrismaService) {
    cloudinary.config();
  }

  async uploadBlogImage(file: Express.Multer.File, req: Request, previousImage?: string) {
    if (previousImage) {
      await deleteCloudinaryImage(previousImage);
    }

    const base64Data = file.buffer.toString('base64');
    const dataURI = `data:${file.mimetype};base64,${base64Data}`;

    const ext = path.extname(file.originalname);
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${baseName}_${Date.now()}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'blog',
      public_id: filename,
    });

    return { success: true, url: result.secure_url };
  }

  async create(createData: any) {
    const blog = await this.prisma.blogPost.create({
      data: createData,
    });
    return { success: true, data: blog };
  }

  async findAll() {
    const blogs = await this.prisma.blogPost.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: blogs };
  }

  async findOne(slug: string) {
    const blog = await this.prisma.blogPost.findUnique({
      where: { slug },
    });
    if (!blog) {
      throw new NotFoundException('Blog post not found');
    }
    return { success: true, data: blog };
  }

  async update(slug: string, updateData: any) {
    const blog = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!blog) throw new NotFoundException('Blog post not found');

    // 1. Storage cleanup for cover image if replaced or removed
    if (blog.image && updateData.image !== blog.image) {
      await deleteCloudinaryImage(blog.image);
    }

    // 2. Storage cleanup for deleted inline body images
    if (updateData.content && blog.content) {
      const oldImages = extractLocalImages(blog.content);
      const newImages = extractLocalImages(updateData.content);
      const deletedImages = oldImages.filter((img) => !newImages.includes(img));

      for (const img of deletedImages) {
        await deleteCloudinaryImage(img);
      }
    }

    const updatedBlog = await this.prisma.blogPost.update({
      where: { slug },
      data: updateData,
    });

    return { success: true, data: updatedBlog };
  }

  async remove(slug: string) {
    const blog = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!blog) {
      throw new NotFoundException('Blog post not found');
    }

    // 1. Clean up cover image
    if (blog.image) {
      await deleteCloudinaryImage(blog.image);
    }

    // 2. Clean up inline body images
    if (blog.content) {
      const bodyImages = extractLocalImages(blog.content);
      for (const img of bodyImages) {
        await deleteCloudinaryImage(img);
      }
    }

    // 3. Delete blog from database
    await this.prisma.blogPost.delete({
      where: { slug },
    });

    return { success: true, message: 'Blog post deleted successfully' };
  }
}
