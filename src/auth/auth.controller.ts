import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  InternalServerErrorException,
  Res,
  NotFoundException,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, SetPasswordDto } from './dto/set-password.dto';
import { Auth } from './decorators/auth.decorator';
import { UsersService } from '../users/users.service';
import { ActiveUser, ActiveUserData } from './decorators/activeUser.decorator';
import { ApiOperation } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
  ) {}
  /// Enlace del correo de bienvenida: fija la contraseña, valida el correo e
  /// inicia sesión. Reemplaza al antiguo POST /auth/register público, que
  /// dejaba a cualquiera crearse una cuenta con el rol que quisiera (ADMIN
  /// incluido); las altas públicas pasan por POST /members/join.
  @Post('verify-email')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 10 * 60 * 1000 } })
  async verifyEmail(@Body() dto: SetPasswordDto, @Res() res) {
    const session = await this.authService.verifyEmail(dto.token, dto.password);
    this.setSessionCookies(res, session);
    return res
      .status(200)
      .json({ message: 'Correo validado', user: session.user });
  }

  private setSessionCookies(
    res: any,
    {
      accessToken,
      refreshToken,
    }: { accessToken: string; refreshToken: string },
  ) {
    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 5 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req, @Res() res) {
    try {
      const loginResult = await this.authService.login(loginDto);
      const { user } = loginResult;
      this.setSessionCookies(res, loginResult);
      return res.status(200).json({
        message: 'Login exitoso',
        user,
      });
    } catch (error) {
      return res.status(500).json({
        message: error.message,
      });
    }
  }
  @Post('refresh')
  async refresh(@Req() req, @Res() res) {
    try {
      const refreshToken = req.cookies['refreshToken'];
      if (!refreshToken) {
        return res.status(401).json({ message: 'No refresh token' });
      }
      // Decodificar el token para obtener el id
      let payload: any;
      try {
        payload =
          await this.authService['jwtService'].verifyAsync(refreshToken);
      } catch {
        return res
          .status(401)
          .json({ message: 'Refresh token inválido o expirado' });
      }
      const { accessToken, refreshToken: newRefreshToken } =
        await this.authService.refresh(payload.id, refreshToken);
      res.cookie('token', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 5 * 60 * 1000,
      });
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.status(200).json({ message: 'Token refrescado' });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  /// Solicitar recuperación: responde lo mismo exista o no la cuenta.
  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Solicitar enlace de recuperación de contraseña' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /// Enlace de recuperación: fija la contraseña nueva e inicia sesión.
  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 10 * 60 * 1000 } })
  @ApiOperation({ summary: 'Elegir contraseña nueva con el enlace del correo' })
  async resetPassword(@Body() dto: SetPasswordDto, @Res() res) {
    const session = await this.authService.resetPassword(
      dto.token,
      dto.password,
    );
    this.setSessionCookies(res, session);
    return res
      .status(200)
      .json({ message: 'Contraseña actualizada', user: session.user });
  }

  @Get('me')
  @Auth()
  async me(@ActiveUser() user: ActiveUserData, @Res() res) {
    try {
      const foundedUser = await this.userService.findById(user.userID);

      if (!foundedUser) {
        return res.clearCookie('token').json({ message: 'logout' });
      }

      // Formatear la respuesta según el nuevo formato requerido
      const userResponse =
        await this.authService.formatUserDataForResponse(foundedUser);

      return res.json({
        message: 'Información del usuario',
        user: userResponse,
      });
    } catch (error) {
      throw new NotFoundException({ message: 'Usuario no encontrado', error });
    }
  }

  @Get('logout')
  logout(@Res() res) {
    try {
      res.clearCookie('token');
      res.clearCookie('refreshToken');
      return res.json({ message: 'logout' });
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al cerrar sesión',
        error,
      });
    }
  }
}
