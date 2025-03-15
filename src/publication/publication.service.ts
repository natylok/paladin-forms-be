import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Publication, PublicationDocument } from './publication.schema';
import { User } from '@prisma/client';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class PublicationService {
  private readonly logger = new Logger(PublicationService.name);

  constructor(
    @InjectModel(Publication.name) private publicationModel: Model<PublicationDocument>,
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) {}

  private async emitEvent(pattern: string, data: any): Promise<void> {
    try {
      this.logger.log(`Emitting ${pattern} event`, { id: data.id });
      await lastValueFrom(this.client.emit(pattern, data));
      this.logger.log(`Successfully emitted ${pattern} event`, { id: data.id });
    } catch (error) {
      this.logger.error(
        `Failed to emit ${pattern} event`,
        error instanceof Error ? error.stack : undefined,
        { id: data.id }
      );
      // Don't throw the error - just log it to prevent disrupting database operations
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
      
      await this.emitEvent('publication.created', {
        id: publication.id,
        timeFrame: publication.timeFrame,
        emails: publication.emails,
        creatorEmail: publication.creatorEmail,
        customerId: publication.customerId,
        createdAt: new Date(),
        action: 'create',
        actionBy: user.email
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

      await this.emitEvent('publication.updated', {
        id: publication.id,
        timeFrame: publication.timeFrame,
        emails: publication.emails,
        creatorEmail: publication.creatorEmail,
        customerId: publication.customerId,
        updatedAt: new Date(),
        action: 'update',
        actionBy: user.email,
        changes: data
      });
      
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

      await this.emitEvent('publication.deleted', {
        id: publication.id,
        timeFrame: publication.timeFrame,
        emails: publication.emails,
        creatorEmail: publication.creatorEmail,
        customerId: publication.customerId,
        deletedAt: new Date(),
        action: 'delete',
        actionBy: user.email
      });
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