import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../auth';
import { ContentService } from './content.service';
import {
  CreateBlockDto,
  CreateSectionDto,
  ReorderBlockDto,
  UpdateBlockDto,
  UpdateSectionDto,
} from './dto';

@ApiTags('Contenido')
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  // ---------- Público ----------

  @Get('public')
  @ApiOperation({
    summary: 'Contenido publicado de la landing',
    description: 'Secciones y bloques activos, ordenados. No requiere autenticación.',
  })
  getPublicContent() {
    return this.contentService.getPublicContent();
  }

  @Get('public/:key')
  @ApiOperation({ summary: 'Una sección publicada por su key' })
  getPublicSection(@Param('key') key: string) {
    return this.contentService.getPublicSection(key);
  }

  // ---------- Administración ----------

  @Get('sections')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Todas las secciones, incluidas las inactivas' })
  findAllSections() {
    return this.contentService.findAllSections();
  }

  @Get('sections/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Detalle de una sección' })
  findSection(@Param('id') id: string) {
    return this.contentService.findSection(id);
  }

  @Post('sections')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Crear sección' })
  createSection(@Body() dto: CreateSectionDto) {
    return this.contentService.createSection(dto);
  }

  @Patch('sections/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar sección' })
  updateSection(@Param('id') id: string, @Body() dto: UpdateSectionDto) {
    return this.contentService.updateSection(id, dto);
  }

  @Delete('sections/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar sección y sus bloques' })
  removeSection(@Param('id') id: string) {
    return this.contentService.removeSection(id);
  }

  @Patch('sections/:id/reorder')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Reordenar los bloques de una sección' })
  reorderBlocks(
    @Param('id') id: string,
    @Body() body: { items: ReorderBlockDto[] },
  ) {
    return this.contentService.reorderBlocks(id, body.items);
  }

  @Post('blocks')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Crear bloque' })
  createBlock(@Body() dto: CreateBlockDto) {
    return this.contentService.createBlock(dto);
  }

  @Patch('blocks/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar bloque' })
  updateBlock(@Param('id') id: string, @Body() dto: UpdateBlockDto) {
    return this.contentService.updateBlock(id, dto);
  }

  @Delete('blocks/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar bloque' })
  removeBlock(@Param('id') id: string) {
    return this.contentService.removeBlock(id);
  }
}
