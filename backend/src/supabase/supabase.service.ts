import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export type UploadedImage = {
  storagePath: string;
  objectPath: string;
  contentType: string;
};

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;
  private readonly bucket: string;
  private readonly signedUrlExpiresInSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.getOrThrow<string>('SUPABASE_URL');
    const secretKey =
      this.configService.get<string>('SUPABASE_SECRET_KEY') ??
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!secretKey) {
      throw new Error(
        'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY must be set',
      );
    }

    this.bucket = this.configService.getOrThrow<string>('SUPABASE_BUCKET');
    this.signedUrlExpiresInSeconds = Number(
      this.configService.get<string>('SUPABASE_SIGNED_URL_EXPIRES_IN') ?? '3600',
    );

    this.client = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  async uploadImage(
    maintenanceRequestId: string,
    file: Express.Multer.File,
  ): Promise<UploadedImage> {
    const extension = this.resolveExtension(file);
    const uniqueName = `${randomUUID()}${extension}`;
    const objectPath = `${maintenanceRequestId}/${uniqueName}`;
    const storagePath = `${this.bucket}/${objectPath}`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to upload image: ${error.message}`,
      );
    }

    return {
      storagePath,
      objectPath,
      contentType: file.mimetype,
    };
  }

  async getSignedUrl(storagePath: string): Promise<string> {
    const objectPath = this.toObjectPath(storagePath);

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, this.signedUrlExpiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        `Failed to create signed URL: ${error?.message ?? 'unknown error'}`,
      );
    }

    return data.signedUrl;
  }

  async deleteImage(storagePath: string): Promise<void> {
    const objectPath = this.toObjectPath(storagePath);

    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([objectPath]);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete image: ${error.message}`,
      );
    }
  }

  async downloadImage(
    storagePath: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const objectPath = this.toObjectPath(storagePath);

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(objectPath);

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to download image: ${error?.message ?? 'unknown error'}`,
      );
    }

    const arrayBuffer = await data.arrayBuffer();
    const contentType = data.type || 'application/octet-stream';

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  }

  private toObjectPath(storagePath: string): string {
    const prefix = `${this.bucket}/`;
    return storagePath.startsWith(prefix)
      ? storagePath.slice(prefix.length)
      : storagePath;
  }

  private resolveExtension(file: Express.Multer.File): string {
    const fromName = extname(file.originalname || '').toLowerCase();
    if (fromName === '.jpg' || fromName === '.jpeg') return '.jpg';
    if (fromName === '.png') return '.png';
    if (fromName === '.webp') return '.webp';

    switch (file.mimetype) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      default:
        throw new BadRequestException('Unsupported image type');
    }
  }
}
