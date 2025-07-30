import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import {
    CreateTeamDto,
    UpdateTeamDto,
    AddTeamMembersDto,
    RemoveTeamMembersDto,
    AssignStoresToTeamDto,
    UnassignStoresFromTeamDto,
    BulkUserOperationDto,
    TeamResponseDto,
} from './dto/team-management.dto';
import { UserRole } from '@prisma/client';

describe('AdminController - Team Management', () => {
    let controller: AdminController;
    let adminService: AdminService;

    const mockOrganizationId = 'org-123';
    const mockUserId = 'user-123';
    const mockTeamId = 'team-123';

    const mockTeamResponse = {
        id: mockTeamId,
        name: 'Test Team',
        description: 'Test team description',
        leaderId: mockUserId,
        leader: {
            id: mockUserId,
            email: 'leader@example.com',
            firstName: 'Team',
            lastName: 'Leader',
            role: UserRole.TEAM_LEADER,
        },
        members: [
            {
                id: 'member-1',
                email: 'member1@example.com',
                fullName: 'Member One',
                role: UserRole.CALL_CENTER_AGENT,
                joinedAt: new Date(),
                isOnline: true,
            },
        ],
        stores: [
            {
                id: 'store-1',
                name: 'Test Store',
                code: 'TEST',
                assignedAt: new Date(),
                isActive: true,
            },
        ],
        memberCount: 1,
        storeCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AdminController],
            providers: [
                {
                    provide: AdminService,
                    useValue: {
                        getTeams: jest.fn(),
                        getTeamById: jest.fn(),
                        createTeam: jest.fn(),
                        updateTeam: jest.fn(),
                        deleteTeam: jest.fn(),
                        addTeamMembers: jest.fn(),
                        removeTeamMembers: jest.fn(),
                        assignStoresToTeam: jest.fn(),
                        unassignStoresFromTeam: jest.fn(),
                        performBulkUserOperation: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get<AdminController>(AdminController);
        adminService = module.get<AdminService>(AdminService);
    });

    describe('getTeams', () => {
        it('should return paginated teams', async () => {
            const mockResponse = {
                teams: [mockTeamResponse],
                pagination: {
                    page: 1,
                    limit: 20,
                    total: 1,
                    pages: 1,
                },
            };

            jest.spyOn(adminService, 'getTeams').mockResolvedValue(mockResponse);

            const result = await controller.getTeams(mockOrganizationId, '1', '20', 'test');

            expect(result).toEqual(mockResponse);
            expect(adminService.getTeams).toHaveBeenCalledWith(mockOrganizationId, {
                page: 1,
                limit: 20,
                search: 'test',
            });
        });

        it('should use default pagination values', async () => {
            const mockResponse = {
                teams: [],
                pagination: { page: 1, limit: 20, total: 0, pages: 0 },
            };

            jest.spyOn(adminService, 'getTeams').mockResolvedValue(mockResponse);

            await controller.getTeams(mockOrganizationId);

            expect(adminService.getTeams).toHaveBeenCalledWith(mockOrganizationId, {
                page: 1,
                limit: 20,
                search: undefined,
            });
        });
    });

    describe('getTeamById', () => {
        it('should return team by ID', async () => {
            jest.spyOn(adminService, 'getTeamById').mockResolvedValue(mockTeamResponse);

            const result = await controller.getTeamById(mockTeamId, mockOrganizationId);

            expect(result).toEqual(mockTeamResponse);
            expect(adminService.getTeamById).toHaveBeenCalledWith(mockTeamId, mockOrganizationId);
        });
    });

    describe('createTeam', () => {
        it('should create a new team', async () => {
            const createTeamDto: CreateTeamDto = {
                name: 'New Team',
                description: 'New team description',
                leaderId: mockUserId,
                memberIds: ['member-1'],
                storeIds: ['store-1'],
            };

            jest.spyOn(adminService, 'createTeam').mockResolvedValue(mockTeamResponse);

            const result = await controller.createTeam(mockOrganizationId, mockUserId, createTeamDto);

            expect(result).toEqual({
                success: true,
                message: 'Team created successfully',
                team: mockTeamResponse,
            });
            expect(adminService.createTeam).toHaveBeenCalledWith(
                mockOrganizationId,
                createTeamDto,
                mockUserId
            );
        });
    });

    describe('updateTeam', () => {
        it('should update team details', async () => {
            const updateTeamDto: UpdateTeamDto = {
                name: 'Updated Team',
                description: 'Updated description',
            };

            jest.spyOn(adminService, 'updateTeam').mockResolvedValue(mockTeamResponse);

            const result = await controller.updateTeam(
                mockTeamId,
                mockOrganizationId,
                mockUserId,
                updateTeamDto
            );

            expect(result).toEqual({
                success: true,
                message: 'Team updated successfully',
                team: mockTeamResponse,
            });
            expect(adminService.updateTeam).toHaveBeenCalledWith(
                mockTeamId,
                mockOrganizationId,
                updateTeamDto,
                mockUserId
            );
        });
    });

    describe('deleteTeam', () => {
        it('should delete team', async () => {
            const mockResponse = { success: true, message: 'Team deleted successfully' };
            jest.spyOn(adminService, 'deleteTeam').mockResolvedValue(mockResponse);

            const result = await controller.deleteTeam(mockTeamId, mockOrganizationId, mockUserId);

            expect(result).toEqual(mockResponse);
            expect(adminService.deleteTeam).toHaveBeenCalledWith(
                mockTeamId,
                mockOrganizationId,
                mockUserId
            );
        });
    });

    describe('addTeamMembers', () => {
        it('should add members to team', async () => {
            const addMembersDto: AddTeamMembersDto = {
                userIds: ['member-1', 'member-2'],
            };

            const mockResponse = {
                success: true,
                message: 'Team members added successfully',
                affectedCount: 2,
                team: mockTeamResponse,
            };

            jest.spyOn(adminService, 'addTeamMembers').mockResolvedValue(mockResponse);

            const result = await controller.addTeamMembers(
                mockTeamId,
                mockOrganizationId,
                mockUserId,
                addMembersDto
            );

            expect(result).toEqual(mockResponse);
            expect(adminService.addTeamMembers).toHaveBeenCalledWith(
                mockTeamId,
                mockOrganizationId,
                addMembersDto,
                mockUserId
            );
        });
    });

    describe('removeTeamMembers', () => {
        it('should remove members from team', async () => {
            const removeMembersDto: RemoveTeamMembersDto = {
                userIds: ['member-1', 'member-2'],
            };

            const mockResponse = {
                success: true,
                message: 'Team members removed successfully',
                affectedCount: 2,
                team: mockTeamResponse,
            };

            jest.spyOn(adminService, 'removeTeamMembers').mockResolvedValue(mockResponse);

            const result = await controller.removeTeamMembers(
                mockTeamId,
                mockOrganizationId,
                mockUserId,
                removeMembersDto
            );

            expect(result).toEqual(mockResponse);
            expect(adminService.removeTeamMembers).toHaveBeenCalledWith(
                mockTeamId,
                mockOrganizationId,
                removeMembersDto,
                mockUserId
            );
        });
    });

    describe('assignStoresToTeam', () => {
        it('should assign stores to team', async () => {
            const assignStoresDto: AssignStoresToTeamDto = {
                storeIds: ['store-1', 'store-2'],
            };

            const mockResponse = {
                success: true,
                message: 'Stores assigned to team successfully',
                affectedCount: 2,
                team: mockTeamResponse,
            };

            jest.spyOn(adminService, 'assignStoresToTeam').mockResolvedValue(mockResponse);

            const result = await controller.assignStoresToTeam(
                mockTeamId,
                mockOrganizationId,
                mockUserId,
                assignStoresDto
            );

            expect(result).toEqual(mockResponse);
            expect(adminService.assignStoresToTeam).toHaveBeenCalledWith(
                mockTeamId,
                mockOrganizationId,
                assignStoresDto,
                mockUserId
            );
        });
    });

    describe('unassignStoresFromTeam', () => {
        it('should unassign stores from team', async () => {
            const unassignStoresDto: UnassignStoresFromTeamDto = {
                storeIds: ['store-1', 'store-2'],
            };

            const mockResponse = {
                success: true,
                message: 'Stores unassigned from team successfully',
                affectedCount: 2,
                team: mockTeamResponse,
            };

            jest.spyOn(adminService, 'unassignStoresFromTeam').mockResolvedValue(mockResponse);

            const result = await controller.unassignStoresFromTeam(
                mockTeamId,
                mockOrganizationId,
                mockUserId,
                unassignStoresDto
            );

            expect(result).toEqual(mockResponse);
            expect(adminService.unassignStoresFromTeam).toHaveBeenCalledWith(
                mockTeamId,
                mockOrganizationId,
                unassignStoresDto,
                mockUserId
            );
        });
    });

    describe('performBulkUserOperation', () => {
        it('should perform bulk user operation', async () => {
            const bulkOperationDto: BulkUserOperationDto = {
                userIds: ['user-1', 'user-2'],
                operation: 'assign_to_team',
                teamId: mockTeamId,
            };

            const mockResponse = {
                success: true,
                message: 'Bulk operation completed successfully',
                processedCount: 2,
                successCount: 2,
                failedCount: 0,
                errors: [],
            };

            jest.spyOn(adminService, 'performBulkUserOperation').mockResolvedValue(mockResponse);

            const result = await controller.performBulkUserOperation(
                mockOrganizationId,
                mockUserId,
                bulkOperationDto
            );

            expect(result).toEqual(mockResponse);
            expect(adminService.performBulkUserOperation).toHaveBeenCalledWith(
                mockOrganizationId,
                bulkOperationDto,
                mockUserId
            );
        });
    });
});