import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// import * as fs from 'fs';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  // Directory initialization omitted in simplified boilerplate.

  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.setGlobalPrefix('api'); // Agrega esta línea para establecer el prefijo global

  // Configurar CORS simple y funcional
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Habilita la transformación automática
      whitelist: true, // Solo permite propiedades definidas en el DTO
      transformOptions: {
        enableImplicitConversion: true, // Permite conversión implícita de tipos
      },
    }),
  );
  const config = new DocumentBuilder()
    .setTitle('Boilerplate backend Api Docs')
    .setDescription('Documentación de los endpoints del backend Boilerplate')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  /*
Bloque para generar el archivo openapi.json en la raíz del proyecto
Descomentar si se necesita el archivo físico  
   */
  // fs.writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  // console.log('OpenAPI guardado en openapi.json');
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
