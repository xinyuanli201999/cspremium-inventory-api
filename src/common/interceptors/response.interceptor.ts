import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Optional column totals (used by reports). */
  totals?: Record<string, number>;
}

/**
 * Wraps every response as { success, data, message }.
 * A service may return { data, meta } for paginated results
 * and { data, message } to customise the message.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (result instanceof StreamableFile) return result; // Excel downloads

        if (
          result &&
          typeof result === 'object' &&
          !Array.isArray(result) &&
          'data' in result &&
          ('meta' in result || 'message' in result)
        ) {
          const { data, meta, message } = result as {
            data: unknown;
            meta?: PaginationMeta;
            message?: string;
          };
          return {
            success: true,
            data,
            ...(meta ? { meta } : {}),
            message: message ?? 'Success',
          };
        }

        return { success: true, data: result ?? null, message: 'Success' };
      }),
    );
  }
}
