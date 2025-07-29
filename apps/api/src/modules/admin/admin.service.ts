import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';

interface GetUsersOptions {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: string;
}

@Injectable()
export class AdminService {
  constructor(private prismaService: PrismaService) {}

  async getUsers(organizationId: string, options: GetUsersOptions) {
    const { page, limit, search, role, status } = options;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role && Object.values(UserRole).includes(role as UserRole)) {
      where.role = role as UserRole;
    }

    if (status && Object.values(UserStatus).includes(status as UserStatus)) {
      where.status = status as UserStatus;
    }

    // Get users with pagination
    const [users, total] = await Promise.all([
      this.prismaService.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatar: true,
          role: true,
          status: true,
          isOnline: true,
          lastActiveAt: true,
          organizationId: true,
          createdAt: true,
          updatedAt: true,
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      this.prismaService.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}