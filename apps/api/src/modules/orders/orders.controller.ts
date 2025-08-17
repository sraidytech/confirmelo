import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { UserRole } from '@prisma/client';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
    private readonly logger = new Logger(OrdersController.name);

    constructor(
        private readonly prismaService: PrismaService,
    ) { }

    @Get()
    @ApiOperation({
        summary: 'List orders',
        description: 'Get list of orders for the current organization',
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'source', required: false, type: String })
    @ApiResponse({
        status: 200,
        description: 'Orders retrieved successfully',
    })
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CALL_CENTER_AGENT, UserRole.FOLLOWUP_AGENT)
    async listOrders(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
        @Query('status') status?: string,
        @Query('source') source?: string,
    ) {
        try {
            const currentPage = Number(page) || 1;
            const currentLimit = Number(limit) || 20;
            const skip = (currentPage - 1) * currentLimit;
            const maxLimit = Math.min(currentLimit, 100);

            const where: any = {
                organizationId: user.organizationId,
                ...(status && { status }),
                ...(source && { source }),
            };

            const [orders, total] = await Promise.all([
                this.prismaService.order.findMany({
                    where,
                    skip,
                    take: maxLimit,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        customer: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                phone: true,
                                email: true,
                                address: true,
                                city: true,
                            },
                        },
                        items: {
                            include: {
                                product: {
                                    select: {
                                        id: true,
                                        name: true,
                                        price: true,
                                        sku: true,
                                    },
                                },
                            },
                        },
                    },
                }),
                this.prismaService.order.count({ where }),
            ]);

            return {
                orders: orders.map((order: any) => ({
                    id: order.id,
                    orderNumber: order.orderNumber,
                    customerName: order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : 'Unknown',
                    customerPhone: order.customer?.phone || '',
                    customerAddress: order.shippingAddress,
                    customerCity: order.shippingCity,
                    productName: order.items?.[0]?.product?.name || 'Unknown Product',
                    productPrice: order.items?.[0]?.product?.price || 0,
                    quantity: order.items?.[0]?.quantity || 1,
                    totalAmount: Number(order.total),
                    status: order.status,
                    source: order.source || 'MANUAL',
                    sourceId: order.sheetSpreadsheetId,
                    notes: order.notes,
                    createdAt: order.createdAt,
                    updatedAt: order.updatedAt,
                })),
                total,
                page: currentPage,
                limit: maxLimit,
                totalPages: Math.ceil(total / maxLimit),
            };
        } catch (error) {
            this.logger.error('Failed to list orders', {
                error: error.message,
                userId: user.id,
            });
            throw error;
        }
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Get order details',
        description: 'Get detailed information about a specific order',
    })
    @ApiParam({ name: 'id', description: 'Order ID' })
    @ApiResponse({
        status: 200,
        description: 'Order details retrieved successfully',
    })
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CALL_CENTER_AGENT, UserRole.FOLLOWUP_AGENT)
    async getOrder(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        try {
            const order = await this.prismaService.order.findFirst({
                where: {
                    id,
                    organizationId: user.organizationId,
                },
                include: {
                    customer: true,
                    items: {
                        include: {
                            product: true,
                        },
                    },
                    assignedAgent: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new NotFoundException('Order not found');
            }

            return order;
        } catch (error) {
            this.logger.error('Failed to get order', {
                error: error.message,
                orderId: id,
                userId: user.id,
            });
            throw error;
        }
    }
}