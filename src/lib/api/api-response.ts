/**
 * Guidon API Response Utilities
 * 
 * Provides standardized API response helpers for consistent error handling
 * and response formatting across all API routes.
 */

import { NextResponse } from "next/server";

// ============================================
// RESPONSE TYPES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: ApiResponse<T[]>["meta"] & {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// SUCCESS RESPONSES
// ============================================

/**
 * Create a successful API response
 */
export function successResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  message?: string
): NextResponse<PaginatedResponse<T>> {
  const totalPages = Math.ceil(total / pageSize);

  return NextResponse.json({
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      page,
      pageSize,
      total,
      totalPages,
    },
  });
}

/**
 * Create a created response (201)
 */
export function createdResponse<T>(
  data: T,
  message: string = "Resource created successfully"
): NextResponse<ApiResponse<T>> {
  return successResponse(data, message, 201);
}

/**
 * Create a no-content response (204)
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ============================================
// ERROR RESPONSES
// ============================================

/**
 * Create a bad request response (400)
 */
export function badRequestResponse(
  error: string,
  details?: any
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(details && { details }),
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 400 }
  );
}

/**
 * Create an unauthorized response (401)
 */
export function unauthorizedResponse(
  error: string = "Unauthorized"
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 401 }
  );
}

/**
 * Create a forbidden response (403)
 */
export function forbiddenResponse(
  error: string = "Forbidden"
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 403 }
  );
}

/**
 * Create a not found response (404)
 */
export function notFoundResponse(
  error: string = "Resource not found"
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 404 }
  );
}

/**
 * Create a conflict response (409)
 */
export function conflictResponse(
  error: string = "Resource conflict"
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 409 }
  );
}

/**
 * Create a validation error response (422)
 */
export function validationErrorResponse(
  errors: Record<string, string[]>
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: "Validation failed",
      details: errors,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 422 }
  );
}

/**
 * Create a server error response (500)
 */
export function serverErrorResponse(
  error: string = "Internal server error"
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 500 }
  );
}

/**
 * Create a service unavailable response (503)
 */
export function serviceUnavailableResponse(
  error: string = "Service unavailable"
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 503 }
  );
}

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Handle Supabase errors and return appropriate responses
 */
export function handleSupabaseError(error: any): NextResponse<ApiResponse> {
  console.error("[API] Supabase error:", error);

  const message = error.message || "Database error";
  const code = error.code;

  // Handle specific error codes
  if (code === "PGRST116") {
    return notFoundResponse("Resource not found");
  }

  if (code === "23505") {
    return conflictResponse("Resource already exists");
  }

  if (code === "23503") {
    return badRequestResponse("Referenced resource does not exist");
  }

  if (code === "23514") {
    return badRequestResponse("Constraint violation");
  }

  // Default to server error
  return serverErrorResponse(message);
}

/**
 * Handle validation errors
 */
export function handleValidationError(errors: string[] | Record<string, string[]>): NextResponse<ApiResponse> {
  if (Array.isArray(errors)) {
    return badRequestResponse(errors.join(", "));
  }

  return validationErrorResponse(errors);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if response is an error
 */
export async function isError(response: NextResponse<ApiResponse>): Promise<boolean> {
  try {
    const clonedResponse = response.clone();
    const data = await clonedResponse.json();
    return data?.success === false;
  } catch {
    return false;
  }
}

/**
 * Extract error message from response
 */
export async function getErrorMessage(response: NextResponse<ApiResponse>): Promise<string | null> {
  try {
    const clonedResponse = response.clone();
    const data = await clonedResponse.json();
    return data?.error || null;
  } catch {
    return null;
  }
}
