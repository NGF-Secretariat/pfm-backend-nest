import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { Request } from 'express';
import { v2 as cloudinary } from 'cloudinary';

function extractAllImageUrls(content: string): string[] {
  if (!content) return [];
  const images = new Set<string>();

  // 1. Match Markdown images: ![alt](url "optional title")
  const mdRegex = /!\[.*?\]\(\s*([^\s\)]+)(?:\s+["'].*?["'])?\s*\)/g;
  let match;
  while ((match = mdRegex.exec(content)) !== null) {
    const url = match[1].replace(/["']/g, '').trim();
    if (url) {
      images.add(url);
    }
  }

  // 2. Match HTML <img> tags: <img ... src="url" ...>
  const htmlRegex = /<img\s+[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/gi;
  while ((match = htmlRegex.exec(content)) !== null) {
    const url = match[1].replace(/["']/g, '').trim();
    if (url) {
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

function extractMetadataFromContent(
  content: string,
  existingAuthor?: string,
  existingDate?: string,
): { content: string; author: string; date: string } {
  let cleanedContent = content || '';
  let author = existingAuthor || 'NGF Secretariat';
  let date = existingDate || '';

  if (!content) return { content: '', author, date };

  // Match Author patterns: Author: John Doe, By John Doe, Written by: John Doe
  const authorRegex = /(?:<p[^>]*>)?\s*(?:<strong>|<b>)?\s*(?:Author|By|Written by)\s*[:\-–—]?\s*(?:<\/strong>|<\/b>)?\s*([^<\n\r]+?)\s*(?:<\/p>)?/i;
  const authorMatch = authorRegex.exec(content);
  if (authorMatch) {
    const extractedAuthor = authorMatch[1].replace(/&nbsp;/g, ' ').trim();
    if (extractedAuthor && (author === 'NGF Secretariat' || !author)) {
      author = extractedAuthor;
    }
    cleanedContent = cleanedContent.replace(authorMatch[0], '');
  }

  // Match Date patterns: Date Produced: July 29, 2026 / Publication Date: April 29, 2026
  const dateRegex = /(?:<p[^>]*>)?\s*(?:<strong>|<b>)?\s*(?:Date Produced|Production Date|Publication Date|Date|Published)\s*[:\-–—]?\s*(?:<\/strong>|<\/b>)?\s*([A-Za-z]+\s+\d{1,2},?\s*\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})\s*(?:<\/p>)?/i;
  const dateMatch = dateRegex.exec(content);
  if (dateMatch) {
    const extractedDate = dateMatch[1].replace(/&nbsp;/g, ' ').trim();
    if (extractedDate && !date) {
      date = extractedDate;
    }
    cleanedContent = cleanedContent.replace(dateMatch[0], '');
  }

  return { content: cleanedContent.trim(), author, date };
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

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.message?.includes("Can't reach database server") || err?.code === 'P1001') {
        console.warn('Retrying DB connection in BlogService...');
        try {
          await this.prisma.$connect();
        } catch (connErr) {
          console.error('Re-connect attempt failed:', connErr);
        }
        return await fn();
      }
      throw err;
    }
  }

  async create(createData: any) {
    return this.executeWithRetry(async () => {
      const { content, author, date } = extractMetadataFromContent(
        createData.content,
        createData.author,
        createData.date,
      );

      const blog = await this.prisma.blogPost.create({
        data: {
          ...createData,
          content,
          author: author || 'NGF Secretariat',
          date: date || createData.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        },
      });
      return { success: true, data: blog };
    });
  }

  async findAll() {
    return this.executeWithRetry(async () => {
      const blogs = await this.prisma.blogPost.findMany({
        orderBy: { createdAt: 'asc' },
      });
      return { success: true, data: blogs };
    });
  }

  async findOne(slug: string) {
    return this.executeWithRetry(async () => {
      const blog = await this.prisma.blogPost.findUnique({
        where: { slug },
      });
      if (!blog) {
        throw new NotFoundException('Blog post not found');
      }
      return { success: true, data: blog };
    });
  }

  async update(slug: string, updateData: any) {
    return this.executeWithRetry(async () => {
      const blog = await this.prisma.blogPost.findUnique({ where: { slug } });
      if (!blog) throw new NotFoundException('Blog post not found');

      // 1. Storage cleanup for cover image if replaced or removed
      if (blog.image && updateData.image !== blog.image) {
        await deleteCloudinaryImage(blog.image);
      }

      // 2. Storage cleanup for deleted inline body images (fig1, fig2, etc.)
      if (updateData.content && blog.content) {
        const oldImages = extractAllImageUrls(blog.content);
        const newImages = extractAllImageUrls(updateData.content);
        const deletedImages = oldImages.filter((img) => !newImages.includes(img));

        for (const img of deletedImages) {
          await deleteCloudinaryImage(img);
        }
      }

      let payload = { ...updateData };
      if (updateData.content) {
        const extracted = extractMetadataFromContent(
          updateData.content,
          updateData.author || blog.author,
          updateData.date || blog.date,
        );
        payload.content = extracted.content;
        payload.author = extracted.author;
        if (extracted.date) payload.date = extracted.date;
      }

      const updatedBlog = await this.prisma.blogPost.update({
        where: { slug },
        data: payload,
      });

      return { success: true, data: updatedBlog };
    });
  }

  async remove(slug: string) {
    return this.executeWithRetry(async () => {
      const blog = await this.prisma.blogPost.findUnique({ where: { slug } });
      if (!blog) {
        throw new NotFoundException('Blog post not found');
      }

      // 1. Clean up cover image
      if (blog.image) {
        await deleteCloudinaryImage(blog.image);
      }

      // 2. Clean up inline body images (fig1, fig2, etc.)
      if (blog.content) {
        const bodyImages = extractAllImageUrls(blog.content);
        for (const img of bodyImages) {
          await deleteCloudinaryImage(img);
        }
      }

      // 3. Delete blog from database
      await this.prisma.blogPost.delete({
        where: { slug },
      });

      return { success: true, message: 'Blog post deleted successfully' };
    });
  }
}
