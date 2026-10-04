import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MemberStatus } from '@prisma/client';
import { ActiveUser, ActiveUserData, Auth, Roles } from '../auth';
import { MembersService } from './members.service';
import {
  CreateCategoryDto,
  CreateMemberDto,
  FilterMemberDto,
  JoinClubDto,
  UpdateCategoryDto,
  UpdateMemberDto,
} from './dto';

@ApiTags('Socios')
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post('join')
  @UseGuards(ThrottlerGuard)
  // Público y envía correos: 5 intentos por IP cada 10 minutos
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  @ApiOperation({
    summary: 'Inscripción pública («Súmate al club»)',
    description:
      'Crea el usuario y la ficha de socio (PENDING) y envía el correo para validar la cuenta. Devuelve la invitación al grupo de WhatsApp.',
  })
  join(@Body() dto: JoinClubDto) {
    return this.membersService.join(dto);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'Categorías activas',
    description: 'Público: el formulario de registro las necesita.',
  })
  findActiveCategories() {
    return this.membersService.findAllCategories(true);
  }

  @Get('categories/all')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Todas las categorías, incluidas las inactivas' })
  findAllCategories() {
    return this.membersService.findAllCategories(false);
  }

  @Post('categories')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Crear categoría' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.membersService.createCategory(dto);
  }

  @Patch('categories/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar categoría' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.membersService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar categoría' })
  removeCategory(@Param('id') id: string) {
    return this.membersService.removeCategory(id);
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Ficha de socio del usuario autenticado' })
  findMine(@ActiveUser() user: ActiveUserData) {
    return this.membersService.findByUserId(user.userID);
  }

  @Get()
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Listado de socios' })
  findAll(@Query() filter: FilterMemberDto) {
    return this.membersService.findAll(filter);
  }

  @Get(':id')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Detalle de un socio' })
  findOne(@Param('id') id: string) {
    return this.membersService.findOne(id);
  }

  @Post()
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Crear ficha de socio' })
  create(@Body() dto: CreateMemberDto) {
    return this.membersService.create(dto);
  }

  @Patch(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar socio' })
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.membersService.update(id, dto);
  }

  @Patch(':id/status')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Cambiar estado del socio',
    description: 'Aprobar (ACTIVE), suspender o dar de baja.',
  })
  updateStatus(@Param('id') id: string, @Body('status') status: MemberStatus) {
    return this.membersService.updateStatus(id, status);
  }

  @Delete(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar socio' })
  remove(@Param('id') id: string) {
    return this.membersService.remove(id);
  }
}
