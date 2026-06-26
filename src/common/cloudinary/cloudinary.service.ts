import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(private config: ConfigService) {
    const cloudName = this.config.get<string>('cloudinary.cloudName');
    const apiKey = this.config.get<string>('cloudinary.apiKey');
    const apiSecret = this.config.get<string>('cloudinary.apiSecret');

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    folder?: string,
    resource_type: 'auto' | 'image' | 'raw' = 'raw',
  ) {
    try {
      const dataUri = `data:application/octet-stream;base64,${buffer.toString(
        'base64',
      )}`;
      const opts: any = { resource_type };
      if (folder) opts.folder = folder;
      if (filename) opts.public_id = filename;
      const res = await cloudinary.uploader.upload(dataUri, opts);
      return res;
    } catch (err) {
      throw new InternalServerErrorException('Cloudinary upload failed');
    }
  }
}
