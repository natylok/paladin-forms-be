import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PublicationService } from './publication.service';
import { PublicationController } from './publication.controller';
import { Publication, PublicationSchema } from './publication.schema';
import { LoggerModule } from '../logger/logger.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Publication.name, schema: PublicationSchema }
    ]),
    ClientsModule.registerAsync([
      {
        name: 'PUBLICATION_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@${configService.get('RABBITMQ_HOST')}:5672`],
            queue: 'publication_queue',
            queueOptions: {
              durable: true
            },
            noAck: true
          },
        }),
        inject: [ConfigService],
      },
    ]),
    LoggerModule
  ],
  controllers: [PublicationController],
  providers: [PublicationService],
  exports: [PublicationService]
})
export class PublicationModule {} 