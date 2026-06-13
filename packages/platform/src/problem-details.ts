/**
 * RFC 9457 Problem Details for cross-service HTTP errors. Every error response
 * carries `type`, `title`, `status`, `code`, and `request_id`; responses never
 * expose stack traces, SQL errors, or other internal details.
 */

export interface ValidationProblem {
  field: string;
  code: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  request_id: string;
  detail?: string;
  instance?: string;
  errors?: ValidationProblem[];
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * An error that maps directly to a Problem Details response. Application and
 * domain code throw this with a stable machine-readable `code`; the platform
 * error handler renders it. Anything that is *not* an AppError is treated as
 * an internal 500 with a generic message so implementation details never leak.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly errors?: ValidationProblem[];

  constructor(args: {
    status: number;
    code: string;
    title: string;
    detail?: string;
    errors?: ValidationProblem[];
  }) {
    super(args.detail ?? args.title);
    this.name = 'AppError';
    this.status = args.status;
    this.code = args.code;
    this.title = args.title;
    this.detail = args.detail;
    this.errors = args.errors;
  }

  static badRequest(code: string, detail: string, errors?: ValidationProblem[]): AppError {
    return new AppError({ status: 400, code, title: 'Bad Request', detail, errors });
  }

  static unauthorized(code: string, detail = 'Authentication required'): AppError {
    return new AppError({ status: 401, code, title: 'Unauthorized', detail });
  }

  static forbidden(code: string, detail = 'Insufficient permissions'): AppError {
    return new AppError({ status: 403, code, title: 'Forbidden', detail });
  }

  static notFound(code: string, detail = 'Resource not found'): AppError {
    return new AppError({ status: 404, code, title: 'Not Found', detail });
  }

  static conflict(code: string, detail: string): AppError {
    return new AppError({ status: 409, code, title: 'Conflict', detail });
  }
}

export function toProblemDetails(error: AppError, requestId: string, instance?: string): ProblemDetails {
  return {
    type: `https://portfolio.local/problems/${error.code}`,
    title: error.title,
    status: error.status,
    code: error.code,
    request_id: requestId,
    ...(error.detail ? { detail: error.detail } : {}),
    ...(instance ? { instance } : {}),
    ...(error.errors ? { errors: error.errors } : {}),
  };
}
