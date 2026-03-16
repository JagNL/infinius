// Shared types used across all packages

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type UserId = string;
export type SessionId = string;
export type MemoryId = string;
