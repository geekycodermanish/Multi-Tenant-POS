import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { HealthService } from './common/services/health.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    logger.log('🚀 Starting Swazei Multi-Tenant POS System...');
    
    const app = await NestFactory.create(AppModule, {
      logger: ['log', 'error', 'warn', 'debug', 'verbose']
    });

    // Global validation — strips unknown fields, transforms types
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Global exception filter
    app.useGlobalFilters(new AllExceptionsFilter());

    const port = process.env.PORT || 3000;
    await app.listen(port);
    
    // Display startup information
    logger.log('='.repeat(60));
    logger.log('🎉 APPLICATION STARTED SUCCESSFULLY');
    logger.log('='.repeat(60));
    logger.log(`📡 Server running on: http://localhost:${port}`);
    logger.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.log(`📋 Health endpoint: http://localhost:${port}/health`);
    
    // Check and display connection status
    const healthService = app.get(HealthService);
    setTimeout(() => {
      healthService.logConnectionStatus();
    }, 1000); // Wait 1 second for all connections to be established

  } catch (error) {
    logger.error('❌ Failed to start application');
    logger.error('Details:', error.message);
    
    if (error.message?.includes('ECONNREFUSED')) {
      logger.error('');
      logger.error('🔧 Database Connection Issues:');
      logger.error('   - Make sure PostgreSQL is running: brew services start postgresql');
      logger.error('   - Check your .env file database settings');
      logger.error('   - Run: createdb swazei_pos (if database doesn\'t exist)');
    }
    
    process.exit(1);
  }
}
bootstrap();
