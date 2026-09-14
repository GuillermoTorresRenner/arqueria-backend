import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendInvitationDto {
  @ApiProperty({
    description: 'Email del cliente a invitar',
    example: 'cliente@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'ID del plan a asignar',
    example: 'plan-uuid-123',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;
}