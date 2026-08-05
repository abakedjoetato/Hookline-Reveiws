import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

export interface ApiClientOptions {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class ApiClient {
  private instance: AxiosInstance;

  constructor(options: ApiClientOptions = {}) {
    const defaultApiUrl =
      typeof window !== "undefined"
        ? "/api/v1"
        : process.env.API_URL || "http://localhost:4000/api/v1";

    this.instance = axios.create({
      baseURL: options.baseURL || defaultApiUrl,
      timeout: options.timeout || 10000,
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // Request interceptor to dynamically inject request tracking IDs
    this.instance.interceptors.request.use(
      (config) => {
        // If we are in the server environment (e.g. Next.js SSR), we can forward trace headers if they exist
        if (typeof window === "undefined") {
          // Server-side trace context can be fetched or generated if needed
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor for unified error parsing
    this.instance.interceptors.response.use(
      (response) => response,
      (error) => {
        const parsedError = {
          message:
            error.response?.data?.message ||
            error.message ||
            "An unexpected error occurred",
          status: error.response?.status || 500,
          code: error.response?.data?.code || "INTERNAL_ERROR",
          details: error.response?.data?.details || null,
        };
        return Promise.reject(parsedError);
      },
    );
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<T>(url, config);
    return response.data;
  }

  public async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.post<T>(url, data, config);
    return response.data;
  }

  public async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.put<T>(url, data, config);
    return response.data;
  }

  public async patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.patch<T>(url, data, config);
    return response.data;
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<T>(url, config);
    return response.data;
  }

  // Health and readiness endpoints access
  public async getHealth(): Promise<{ status: string; timestamp: string }> {
    return this.get<{ status: string; timestamp: string }>("/health");
  }

  public async getReadiness(): Promise<{
    status: string;
    services: Record<string, string>;
  }> {
    return this.get<{ status: string; services: Record<string, string> }>(
      "/readiness",
    );
  }
}

export const createApiClient = (options?: ApiClientOptions): ApiClient => {
  return new ApiClient(options);
};
