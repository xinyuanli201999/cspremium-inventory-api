import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[] };
        if (Array.isArray(b.message)) {
          message = 'ទិន្នន័យមិនត្រឹមត្រូវ (Validation failed)';
          errors = b.message; // class-validator messages
        } else {
          message = b.message ?? exception.message;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[] | string | undefined);
          const fields = Array.isArray(target) ? target.join(', ') : target;
          message = `ទិន្នន័យស្ទួន${fields ? ` (${fields})` : ''} — មានរួចហើយ`;
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'រកមិនឃើញទិន្នន័យ';
          break;
        case 'P2003':
          status = HttpStatus.CONFLICT;
          message = 'ទិន្នន័យនេះត្រូវបានប្រើដោយទិន្នន័យផ្សេង ដូច្នេះមិនអាចកែ ឬលុបបានទេ';
          break;
        default:
          this.logger.error(exception.message, exception.stack);
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({ success: false, message, errors });
  }
}
