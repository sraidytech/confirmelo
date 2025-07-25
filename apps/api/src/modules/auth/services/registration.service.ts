import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { PasswordUtil } from '../../../common/utils/password.util';
import { OrganizationUtil } from '../../../common/utils/organization.util';
import { RegisterOrganizationDto, RegisterResponseDto } from '../dto/register.dto';
import { UserRole, UserStatus, Currency } from '@prisma/client';

@Injectable()
export class RegistrationService {
  constructor(
    private prisma: PrismaService,
    private passwordUtil: PasswordUtil,
    private organizationUtil: OrganizationUtil,
  ) {}

  async registerOrganization(dto: RegisterOrganizationDto): Promise<RegisterResponseDto> {
    // Validate password strength
    const passwordValidation = this.passwordUtil.validatePasswordStrength(dto.adminUser.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: 'Password does not meet security requirements',
        errors: passwordValidation.feedback,
      });
    }

    // Check if organization email already exists
    const existingOrgByEmail = await this.prisma.organization.findFirst({
      where: { email: dto.organization.email },
    });

    if (existingOrgByEmail) {
      throw new ConflictException('An organization with this email already exists');
    }

    // Check if admin email already exists
    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email: dto.adminUser.email },
    });

    if (existingUserByEmail) {
      throw new ConflictException('A user with this email already exists');
    }

    // Check if username already exists
    const existingUserByUsername = await this.prisma.user.findUnique({
      where: { username: dto.adminUser.username },
    });

    if (existingUserByUsername) {
      throw new ConflictException('This username is already taken');
    }

    // Generate unique organization code
    const organizationCode = await this.organizationUtil.generateUniqueCode(dto.organization.name);

    // Hash the admin password
    const hashedPassword = await this.passwordUtil.hashPassword(dto.adminUser.password);

    // Create organization and admin user in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: dto.organization.name,
          code: organizationCode,
          email: dto.organization.email,
          phone: dto.organization.phone,
          address: dto.organization.address,
          city: dto.organization.city,
          website: dto.organization.website,
          taxId: dto.organization.taxId,
          country: 'MA', // Default to Morocco
          timezone: 'Africa/Casablanca',
          currency: Currency.MAD,
        },
      });

      // Create admin user
      const adminUser = await tx.user.create({
        data: {
          email: dto.adminUser.email,
          username: dto.adminUser.username,
          password: hashedPassword,
          firstName: dto.adminUser.firstName,
          lastName: dto.adminUser.lastName,
          phone: dto.adminUser.phone,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE, // Auto-activate admin accounts
          organizationId: organization.id,
        },
      });

      // Create default call statuses for the organization
      await this.createDefaultCallStatuses(tx, organization.id);

      return { organization, adminUser };
    });

    // Return success response
    return {
      success: true,
      message: 'Organization registered successfully',
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        code: result.organization.code,
        email: result.organization.email,
      },
      user: {
        id: result.adminUser.id,
        email: result.adminUser.email,
        username: result.adminUser.username,
        firstName: result.adminUser.firstName,
        lastName: result.adminUser.lastName,
        role: result.adminUser.role,
        status: result.adminUser.status,
      },
    };
  }

  /**
   * Create default call statuses for a new organization
   */
  private async createDefaultCallStatuses(tx: any, organizationId: string) {
    const defaultStatuses = [
      {
        name: 'Confirmed',
        code: 'CONFIRMED',
        description: 'Order confirmed by customer',
        color: '#10B981',
        isSuccess: true,
        requiresFollowup: false,
        countsAsAttempt: true,
        displayOrder: 1,
      },
      {
        name: 'Not Interested',
        code: 'NOT_INTERESTED',
        description: 'Customer not interested',
        color: '#EF4444',
        isSuccess: false,
        requiresFollowup: false,
        countsAsAttempt: true,
        displayOrder: 2,
      },
      {
        name: 'No Answer',
        code: 'NO_ANSWER',
        description: 'Customer did not answer',
        color: '#F59E0B',
        isSuccess: false,
        requiresFollowup: true,
        countsAsAttempt: true,
        displayOrder: 3,
      },
      {
        name: 'Wrong Number',
        code: 'WRONG_NUMBER',
        description: 'Incorrect phone number',
        color: '#6B7280',
        isSuccess: false,
        requiresFollowup: false,
        countsAsAttempt: false,
        displayOrder: 4,
      },
      {
        name: 'Callback Requested',
        code: 'CALLBACK_REQUESTED',
        description: 'Customer requested callback',
        color: '#8B5CF6',
        isSuccess: false,
        requiresFollowup: true,
        countsAsAttempt: true,
        displayOrder: 5,
      },
    ];

    for (const status of defaultStatuses) {
      await tx.callStatus.create({
        data: {
          ...status,
          organizationId,
        },
      });
    }
  }

  /**
   * Check if organization name is available
   */
  async isOrganizationNameAvailable(name: string): Promise<boolean> {
    const existing = await this.prisma.organization.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });

    return !existing;
  }

  /**
   * Check if email is available
   */
  async isEmailAvailable(email: string): Promise<boolean> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    const existingOrg = await this.prisma.organization.findFirst({
      where: { email },
    });

    return !existingUser && !existingOrg;
  }

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });

    return !existing;
  }
}