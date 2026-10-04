import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { FilterUserDto } from './dto/filter-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { FindAllUsersResponseDto } from './dto/find-all-users-response.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import {
  ActiveUser,
  type ActiveUserData,
} from '../auth/decorators/activeUser.decorator';
import { Roles } from '../auth/roles.enum';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';

@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Auth([Roles.ADMIN])
  @UseInterceptors(FileInterceptor('avatar'))
  create(
    @Body() createUserDto: CreateUserDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.usersService.register(createUserDto, avatar);
  }

  @Get('dashboard')
  @UseGuards(AuthGuard, RoleGuard)
  @Auth([Roles.ADMIN])
  getUserDashboardInfo() {
    return this.usersService.getDashboardInfo();
  }

  @Get('select')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Datos para selects de creación de usuarios',
    description: 'Devuelve los roles disponibles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos para selects',
    schema: {
      type: 'object',
      properties: {
        roles: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
          },
        },
      },
    },
  })
  getUsersForSelect() {
    return this.usersService.getSelectUserCreationData();
  }

  @Get()
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Obtener usuarios con paginación',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Página',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite por página',
    example: 10,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Campo para ordenar',
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'asc o desc',
    example: 'desc',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Filtrar por nombre',
    example: 'Juan',
  })
  @ApiQuery({
    name: 'surname',
    required: false,
    description: 'Filtrar por apellido',
    example: 'Pérez',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    description: 'Filtrar por rol',
    example: 'ADMIN',
    enum: Roles,
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filtrar por estado (activo/inactivo)',
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuarios con datos adicionales.',
    type: FindAllUsersResponseDto,
  })
  findAll(@Query() query: FilterUserDto) {
    return this.usersService.findAll(query);
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  findMe(@ActiveUser() user: ActiveUserData) {
    return this.usersService.findByIdPublic(user.userID);
  }

  @Patch('me')
  @Auth()
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({
    summary: 'Actualizar mi perfil',
    description:
      'Nombre, apellido, teléfono y avatar. El rol no se puede cambiar aquí.',
  })
  updateMe(
    @ActiveUser() user: ActiveUserData,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    // Nadie se cambia su propio rol ni se reactiva a sí mismo.
    const { role: _role, isActive: _isActive, ...safe } = updateUserDto;
    return this.usersService.updateUserData(user.userID, safe, avatar);
  }

  @Patch('me/password')
  @Auth()
  @ApiOperation({ summary: 'Cambiar mi contraseña' })
  changeMyPassword(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: ChangePasswordDto,
  ) {
    // Se pasa el rol del propio usuario: aunque sea ADMIN, al cambiar SU clave
    // se le sigue exigiendo la actual.
    return this.usersService.changeOwnPassword(user.userID, dto);
  }

  @Get(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Detalle de un usuario' })
  findOne(@Param('id') id: string) {
    return this.usersService.findByIdPublic(id);
  }

  @Patch(':id')
  @Auth([Roles.ADMIN])
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({ summary: 'Actualizar un usuario' })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @ActiveUser() requester: ActiveUserData,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    // Mismo criterio que el DELETE: un admin no puede quitarse a sí mismo el
    // acceso al panel. Si fuera el único, nadie podría devolvérselo.
    if (id === requester.userID) {
      if (
        updateUserDto.role !== undefined &&
        updateUserDto.role !== Roles.ADMIN
      ) {
        throw new BadRequestException('No puedes cambiar tu propio rol');
      }
      if (updateUserDto.isActive === false) {
        throw new BadRequestException('No puedes desactivar tu propia cuenta');
      }
    }
    return this.usersService.updateUserData(id, updateUserDto, avatar);
  }

  /// El admin no fija contraseñas ajenas: envía al usuario un enlace (la
  /// invitación si no activó su cuenta, o uno de recuperación si ya lo hizo).
  @Post(':id/access-email')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Enviar correo de acceso',
    description:
      'Reenvía la invitación (cuenta sin activar) o envía un enlace de recuperación (cuenta activa). La contraseña la elige siempre el usuario.',
  })
  sendAccessEmail(@Param('id') id: string) {
    return this.usersService.sendAccessEmail(id);
  }

  @Delete(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Desactivar un usuario',
    description: 'Baja lógica: conserva su histórico de puntajes y torneos.',
  })
  desactivate(
    @Param('id') id: string,
    @ActiveUser() requester: ActiveUserData,
  ) {
    if (id === requester.userID) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta');
    }
    return this.usersService.desactivateUser(id);
  }

  @Patch(':id/activate')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Reactivar un usuario' })
  activate(@Param('id') id: string) {
    return this.usersService.activateUser(id);
  }
}
