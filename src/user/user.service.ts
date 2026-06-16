import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async create(data: any) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const { password, ...user } = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
      },
    });
    return user;
  }

  async update(id: number, data: any) {
    const updateData: any = {
      name: data.name,
      email: data.email,
      role: data.role,
    };
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const { password, ...user } = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    return user;
  }

  async remove(id: number) {
    await this.prisma.user.delete({
      where: { id },
    });
    return { success: true };
  }
}
