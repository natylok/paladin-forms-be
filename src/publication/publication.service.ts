import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Publication, PublicationDocument } from './publication.schema';
import { User } from '@prisma/client';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout, catchError } from 'rxjs';
import { TimeoutError } from 'rxjs';

@Injectable()
export class PublicationService {
  private readonly logger = new Logger(PublicationService.name);

  constructor(
    @InjectModel(Publication.name) private publicationModel: Model<PublicationDocument>,
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) {}

  private async emitEvent(pattern: string, data: any, id: string): Promise<void> {
    try {
      this.logger.log(`Emitting ${pattern} event`, data);
      
      // First check if client is connected
      if (!this.client || !this.client['connected']) {
        this.logger.warn('RabbitMQ client is not connected, attempting to connect...');
        await this.client.connect();
      }

      await lastValueFrom(
        this.client.emit(pattern, data).pipe(
          timeout(10000),
          catchError(error => {
            if (error instanceof TimeoutError) {
              throw new Error(`Event emission timed out after 10000ms`);
            }
            // Log the full error details
            this.logger.error('Error in event emission pipe', {
              error: error instanceof Error ? error.message : error,
              stack: error instanceof Error ? error.stack : undefined,
              code: error['code'],
              errno: error['errno'],
              syscall: error['syscall']
            });
            throw error;
          })
        )
      );
      
      this.logger.log(`Successfully emitted ${pattern} event`, { id });
    } catch (error) {
      // Enhanced error logging
      const errorDetails = {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        code: error['code'],
        errno: error['errno'],
        syscall: error['syscall'],
        connectionState: this.client['connected'] ? 'connected' : 'disconnected'
      };

      this.logger.error(
        `Failed to emit ${pattern} event`,
        error instanceof Error ? error.stack : undefined,
        errorDetails
      );

      // Try to reconnect if it seems to be a connection issue
      if (!this.client['connected']) {
        this.logger.warn('Attempting to reconnect to RabbitMQ...');
        try {
          await this.client.connect();
        } catch (reconnectError) {
          this.logger.error(
            'Failed to reconnect to RabbitMQ',
            reconnectError instanceof Error ? reconnectError.stack : undefined
          );
        }
      }
    }
  }

  async create(user: User, data: Partial<Publication>): Promise<Publication> {
    try {
      this.logger.log('Creating new publication', { user: user.email });
      
      const publication = new this.publicationModel({
        ...data,
        creatorEmail: user.email,
        customerId: user.customerId
      });
      
      await publication.save();
      
      const eventData = {
        id: publication.id,
        timeFrame: publication.timeFrame,
        emails: publication.emails,
        creatorEmail: publication.creatorEmail,
        customerId: publication.customerId,
        createdAt: new Date(),
        action: 'create',
        actionBy: user.email
      };

      await this.emitEvent('publication.created', eventData, publication.id);
      
      this.logger.log('Publication created successfully', { 
        id: publication.id,
        user: user.email 
      });
      
      return publication;
    } catch (error) {
      this.logger.error(
        'Failed to create publication',
        error instanceof Error ? error.stack : undefined,
        { user: user.email }
      );
      throw error;
    }
  }

  async findAll(user: User): Promise<Publication[]> {
    try {
      this.logger.log('Fetching all publications', { user: user.email });
      
      const query = user.customerId 
        ? { customerId: user.customerId }
        : { creatorEmail: user.email };
      
      const publications = await this.publicationModel.find(query).exec();
      
      this.logger.log('Publications fetched successfully', {
        count: publications.length,
        user: user.email
      });
      
      return publications;
    } catch (error) {
      this.logger.error(
        'Failed to fetch publications',
        error instanceof Error ? error.stack : undefined,
        { user: user.email }
      );
      throw error;
    }
  }

  async findOne(user: User, id: string): Promise<Publication> {
    try {
      this.logger.log('Fetching publication', { id, user: user.email });
      
      const query = user.customerId
        ? { id, customerId: user.customerId }
        : { id, creatorEmail: user.email };
      
      const publication = await this.publicationModel.findOne(query).exec();
      
      if (!publication) {
        throw new NotFoundException('Publication not found');
      }
      
      this.logger.log('Publication fetched successfully', { id, user: user.email });
      
      return publication;
    } catch (error) {
      this.logger.error(
        'Failed to fetch publication',
        error instanceof Error ? error.stack : undefined,
        { id, user: user.email }
      );
      throw error;
    }
  }

  async update(user: User, id: string, data: Partial<Publication>): Promise<Publication> {
    try {
      this.logger.log('Updating publication', { id, user: user.email });
      
      const query = user.customerId
        ? { id, customerId: user.customerId }
        : { id, creatorEmail: user.email };
      
      const publication = await this.publicationModel.findOneAndUpdate(
        query,
        { $set: data },
        { new: true }
      ).exec();
      
      if (!publication) {
        throw new NotFoundException('Publication not found');
      }

      const eventData = {
        id: publication.id,
        timeFrame: publication.timeFrame,
        emails: publication.emails,
        creatorEmail: publication.creatorEmail,
        customerId: publication.customerId,
        updatedAt: new Date(),
        action: 'update',
        actionBy: user.email,
        changes: data
      };

      await this.emitEvent('publication.updated', eventData, publication.id);
      
      this.logger.log('Publication updated successfully', { id, user: user.email });
      
      return publication;
    } catch (error) {
      this.logger.error(
        'Failed to update publication',
        error instanceof Error ? error.stack : undefined,
        { id, user: user.email }
      );
      throw error;
    }
  }

  async delete(user: User, id: string): Promise<void> {
    try {
      this.logger.log('Deleting publication', { id, user: user.email });
      
      const query = user.customerId
        ? { id, customerId: user.customerId }
        : { id, creatorEmail: user.email };
      
      const publication = await this.publicationModel.findOne(query).exec();
      
      if (!publication) {
        throw new NotFoundException('Publication not found');
      }

      await this.publicationModel.deleteOne(query).exec();

      const eventData = {
        id: publication.id,
        timeFrame: publication.timeFrame,
        emails: publication.emails,
        creatorEmail: publication.creatorEmail,
        customerId: publication.customerId,
        deletedAt: new Date(),
        action: 'delete',
        actionBy: user.email
      };

      await this.emitEvent('publication.deleted', eventData, publication.id);
      
      this.logger.log('Publication deleted successfully', { id, user: user.email });
    } catch (error) {
      this.logger.error(
        'Failed to delete publication',
        error instanceof Error ? error.stack : undefined,
        { id, user: user.email }
      );
      throw error;
    }
  }
} 