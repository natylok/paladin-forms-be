import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [
    ConfigModule
  ],
  controllers: [QueueController],
  providers: [QueueService]
})
export class QueueModule {}