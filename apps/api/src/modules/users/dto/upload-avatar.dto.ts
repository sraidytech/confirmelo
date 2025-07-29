import { ApiProperty } from '@nestjs/swagger';

export class UploadAvatarResponseDto {
  @ApiProperty({ example: true, description: 'Upload success status' })
  success: boolean;

  @ApiProperty({ example: 'Avatar uploaded successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ example: 'https://example.com/uploads/avatar-123.jpg', description: 'Avatar URL' })
  avatarUrl: string;
}