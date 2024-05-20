import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TokenMonitorModule } from './modules/tokenmonitor.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), TokenMonitorModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
