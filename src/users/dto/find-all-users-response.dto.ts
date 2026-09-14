import { ApiProperty } from '@nestjs/swagger';

export class PaginationDto {
  @ApiProperty({ description: 'Página actual', example: 1 })
  currentPage: number;

  @ApiProperty({ description: 'Total de páginas', example: 5 })
  totalPages: number;

  @ApiProperty({ description: 'Total de elementos', example: 50 })
  totalCount: number;

  @ApiProperty({ description: 'Límite por página', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Tiene página siguiente', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Tiene página anterior', example: false })
  hasPreviousPage: boolean;

  @ApiProperty({ description: 'Página siguiente', example: 2, nullable: true })
  nextPage: number | null;

  @ApiProperty({
    description: 'Página anterior',
    example: null,
    nullable: true,
  })
  previousPage: number | null;
}

export class SelectItemDto {
  @ApiProperty({ description: 'ID del elemento', example: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Nombre del elemento', example: 'Nombre' })
  name: string;
}

export class SubscriptionSelectDto {
  @ApiProperty({ description: 'ID de la suscripción', example: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Estado de la suscripción', example: 'ACTIVE' })
  status: string;

  @ApiProperty({ description: 'Nombre del plan', example: 'Plan Básico' })
  planName: string;
}

export class SelectsDto {
  @ApiProperty({
    description: 'Lista de roles disponibles',
    type: [SelectItemDto],
  })
  roles: SelectItemDto[];

  @ApiProperty({
    description: 'Lista de compañías disponibles',
    type: [SelectItemDto],
  })
  companies: SelectItemDto[];

  @ApiProperty({
    description: 'Lista de módulos disponibles',
    type: [SelectItemDto],
  })
  modules: SelectItemDto[];

  @ApiProperty({
    description: 'Lista de planes disponibles',
    type: [SelectItemDto],
  })
  plans: SelectItemDto[];

  @ApiProperty({
    description: 'Lista de clientes disponibles',
    type: [SelectItemDto],
  })
  customers: SelectItemDto[];

  @ApiProperty({
    description: 'Lista de suscripciones disponibles',
    type: [SubscriptionSelectDto],
  })
  subscriptions: SubscriptionSelectDto[];
}

export class UserRoleDto {
  @ApiProperty({ description: 'ID del rol', example: 'ADMIN' })
  id: string;

  @ApiProperty({ description: 'Nombre del rol', example: 'Administrador' })
  name: string;
}

export class FindAllUsersResponseDto {
  @ApiProperty({ description: 'Datos de los usuarios', type: [Object] }) // Aquí podrías definir un UserDto si existe
  data: any[];

  @ApiProperty({
    description: 'Información de paginación',
    type: PaginationDto,
  })
  pagination: PaginationDto;

  @ApiProperty({ description: 'Datos para selects', type: SelectsDto })
  selects: SelectsDto;

  @ApiProperty({
    description: 'Lista de roles de usuario',
    type: [UserRoleDto],
  })
  userRoles: UserRoleDto[];

  @ApiProperty({ description: 'Lista de compañías', type: [SelectItemDto] })
  companies: SelectItemDto[];

  @ApiProperty({ description: 'Lista de planes', type: [SelectItemDto] })
  plans: SelectItemDto[];

  @ApiProperty({ description: 'Lista de clientes', type: [SelectItemDto] })
  customers: SelectItemDto[];

  @ApiProperty({
    description: 'Lista de suscripciones',
    type: [SubscriptionSelectDto],
  })
  subscriptions: SubscriptionSelectDto[];
}
