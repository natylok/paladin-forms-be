import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { PublicationService } from './publication.service';
import { Publication } from './publication.schema';
import { JwtGuard } from '../auth/guards';
import { User } from '@prisma/client';
import { Request } from 'express';
import { LoggerService } from '../logger/logger.service';

@Controller('publications')
@UseGuards(JwtGuard)
export class PublicationController {
  constructor(
    private readonly publicationService: PublicationService,
    private readonly logger: LoggerService
  ) {}

  @Post()
  async create(@Req() req: Request, @Body() data: Partial<Publication>) {
    try {
      const user = req.user as User;
      this.logger.log('Creating publication', { user: user.email });
      const publication = await this.publicationService.create(user, data);
      this.logger.log('Publication created successfully', { id: publication.id, user: user.email });
      return publication;
    } catch (error) {
      this.logger.error(
        'Failed to create publication',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email }
      );
      throw new HttpException(
        'Failed to create publication',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  async findAll(@Req() req: Request) {
    try {
      const user = req.user as User;
      this.logger.log('Fetching all publications', { user: user.email });
      const publications = await this.publicationService.findAll(user);
      this.logger.log('Publications fetched successfully', {
        count: publications.length,
        user: user.email
      });
      return publications;
    } catch (error) {
      this.logger.error(
        'Failed to fetch publications',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email }
      );
      throw new HttpException(
        'Failed to fetch publications',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    try {
      const user = req.user as User;
      this.logger.log('Fetching publication', { id, user: user.email });
      const publication = await this.publicationService.findOne(user, id);
      this.logger.log('Publication fetched successfully', { id, user: user.email });
      return publication;
    } catch (error) {
      this.logger.error(
        'Failed to fetch publication',
        error instanceof Error ? error.stack : undefined,
        { id, user: (req.user as User)?.email }
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch publication',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() data: Partial<Publication>
  ) {
    try {
      const user = req.user as User;
      this.logger.log('Updating publication', { id, user: user.email });
      const publication = await this.publicationService.update(user, id, data);
      this.logger.log('Publication updated successfully', { id, user: user.email });
      return publication;
    } catch (error) {
      this.logger.error(
        'Failed to update publication',
        error instanceof Error ? error.stack : undefined,
        { id, user: (req.user as User)?.email }
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update publication',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string) {
    try {
      const user = req.user as User;
      this.logger.log('Deleting publication', { id, user: user.email });
      await this.publicationService.delete(user, id);
      this.logger.log('Publication deleted successfully', { id, user: user.email });
      return { message: 'Publication deleted successfully' };
    } catch (error) {
      this.logger.error(
        'Failed to delete publication',
        error instanceof Error ? error.stack : undefined,
        { id, user: (req.user as User)?.email }
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete publication',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 