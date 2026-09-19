import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AxiosError } from 'axios';

/**
 * Without this, an unhandled provider (Monnify, etc.) error bubbles up as a
 * raw AxiosError, which Nest's default handler turns into an opaque 500 -
 * hiding the provider's actual validation/decline message from the client.
 */
@Catch(AxiosError)
export class AxiosExceptionFilter implements ExceptionFilter {
  catch(exception: AxiosError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const data: any = exception.response?.data;
    const message =
      data?.responseMessage || data?.message || 'Upstream provider request failed';

    const upstreamStatus = exception.response?.status;
    const status =
      upstreamStatus && upstreamStatus < 500
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.BAD_GATEWAY;

    response.status(status).json({
      statusCode: status,
      error: status === HttpStatus.BAD_REQUEST ? 'Bad Request' : 'Bad Gateway',
      message,
    });
  }
}
