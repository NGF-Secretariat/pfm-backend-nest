import { Injectable } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService) {}

  async create(createContactDto: any) {
    try {
      const contact = await this.prisma.contact.create({
        data: {
          firstName: createContactDto.first_name,
          lastName: createContactDto.last_name,
          email: createContactDto.email,
          message: createContactDto.message,
        },
      });
      return { success: true, message: 'Thank you. Your message has been sent successfully.', data: contact };
    } catch (error) {
      return { success: false, message: 'Failed to send message. Please try again.' };
    }
  }

  async findAll() {
    try {
      const contacts = await this.prisma.contact.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return { success: true, data: contacts };
    } catch (error) {
      return { success: false, message: 'Failed to fetch contacts' };
    }
  }
}
