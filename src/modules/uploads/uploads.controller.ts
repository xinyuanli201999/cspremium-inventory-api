import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Roles } from '../../common/decorators/roles.decorator';
import { StorageService } from '../storage/storage.service';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Roles(Role.ADMIN)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      // Kept in memory (max 5 MB) so the real content can be checked before anything is stored
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES, files: 1 },
      // First, cheap filter on the declared type; the service re-checks the actual bytes
      fileFilter: (_req, file, cb) =>
        ALLOWED_MIME.has(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException('អនុញ្ញាតតែរូបភាព JPG, PNG, WEBP, GIF'), false),
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('សូមជ្រើសរើសរូបភាព');
    return this.storage.uploadImage(file.buffer);
  }
}
