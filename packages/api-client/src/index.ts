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

  // Live Session API
  public liveSessions = {
    getPublic: () =>
      this.get<import("@platform/types").PublicLiveSessionSummary[]>(
        "/live-sessions/public",
      ),

    getPublicById: (id: string) =>
      this.get<import("@platform/types").PublicLiveSessionDetail>(
        `/live-sessions/${id}/public`,
      ),

    getPublicQueue: (id: string) =>
      this.get<import("@platform/types").PublicQueueEntry[]>(
        `/live-sessions/${id}/queue/public`,
      ),

    getSubmissionEligibility: (id: string) =>
      this.get<import("@platform/types").SubmissionEligibilityResponse>(
        `/live-sessions/${id}/submission-eligibility`,
      ),

    createSubmission: (
      id: string,
      data: import("@platform/types").CreateSubmissionDto,
      idempotencyKey: string,
    ) =>
      this.post<import("@platform/types").CreateSubmissionResponse>(
        `/live-sessions/${id}/submissions`,
        data,
        {
          headers: {
            "idempotency-key": idempotencyKey,
          },
        },
      ),

    create: (data: {
      stationId: string;
      liveTitle: string;
      primaryStreamingPlatform: string;
      savedProfileUrlSnapshot: string;
    }) => this.post<any>("/live-sessions", data),

    get: (id: string) => this.get<any>(`/live-sessions/${id}`),

    start: (id: string, expectedQueueRevision: number) =>
      this.post<any>(`/live-sessions/${id}/start`, { expectedQueueRevision }),

    pause: (id: string, expectedQueueRevision: number) =>
      this.post<any>(`/live-sessions/${id}/pause`, { expectedQueueRevision }),

    resume: (id: string, expectedQueueRevision: number) =>
      this.post<any>(`/live-sessions/${id}/resume`, { expectedQueueRevision }),

    end: (id: string, expectedQueueRevision: number) =>
      this.post<any>(`/live-sessions/${id}/end`, { expectedQueueRevision }),

    getQueue: (id: string) => this.get<any[]>(`/live-sessions/${id}/queue`),

    playNext: (id: string, expectedQueueRevision: number) =>
      this.post<{ success: boolean }>(`/live-sessions/${id}/queue/play-next`, {
        expectedQueueRevision,
      }),

    loadQueueEntry: (
      id: string,
      entryId: string,
      expectedQueueRevision: number,
    ) =>
      this.post<{ success: boolean }>(
        `/live-sessions/${id}/queue/entries/${entryId}/load`,
        { expectedQueueRevision },
      ),

    clearPlayer: (id: string, expectedQueueRevision: number) =>
      this.post<{ success: boolean }>(
        `/live-sessions/${id}/queue/player/clear`,
        { expectedQueueRevision },
      ),

    moveToNext: (id: string, entryId: string, expectedQueueRevision: number) =>
      this.post<{ success: boolean }>(
        `/live-sessions/${id}/queue/entries/${entryId}/move-to-next`,
        { expectedQueueRevision },
      ),

    changeEntryTier: (
      id: string,
      entryId: string,
      data: { destinationType: "FREE" | "PRIORITY_TIER"; tierSnapshotId?: string },
    ) =>
      this.post<{ success: boolean; message?: string }>(
        `/live-sessions/${id}/queue/entries/${entryId}/tier`,
        data,
      ),

    updateConfiguration: (id: string, data: any) =>
      this.patch<{ success: boolean }>(`/live-sessions/${id}/configuration`, data),
  };

  // Submissions API
  public submissions = {
    getMine: () =>
      this.get<import("@platform/types").UserSubmissionSummary[]>(
        "/submissions/mine",
      ),

    upgrade: (
      submissionId: string,
      data: import("@platform/types").UpgradeSubmissionDto,
      idempotencyKey: string,
    ) =>
      this.post<import("@platform/types").UpgradeSubmissionResponse>(
        `/submissions/${submissionId}/upgrade`,
        data,
        {
          headers: {
            "idempotency-key": idempotencyKey,
          },
        },
      ),
  };

  // Tracks API
  public tracks = {
    list: () =>
      this.get<import("@platform/types").TrackSummary[]>("/tracks"),

    get: (trackId: string) =>
      this.get<import("@platform/types").TrackSummary>(`/tracks/${trackId}`),

    createUploadUrl: (dto: import("@platform/types").CreateTrackUploadUrlDto) =>
      this.post<import("@platform/types").CreateUploadUrlResponse>(
        "/tracks/upload-url",
        dto,
      ),

    completeUpload: (trackId: string, uploadIntentId: string) =>
      this.post<{ success: boolean }>(`/tracks/${trackId}/upload-complete`, {
        uploadIntentId,
      }),

    delete: (trackId: string) =>
      this.delete<{ success: boolean }>(`/tracks/${trackId}`),

    download: (trackId: string, versionId?: string) =>
      this.post<{ downloadUrl: string; mimeType?: string }>(
        `/tracks/${trackId}/download`,
        { versionId },
      ),
  };

  // Auth API
  public auth = {
    getMe: () => this.get<{ user: any }>("/auth/me"),
    login: (data: { emailOrUsername: string; passwordPlain: string }) =>
      this.post<{ success: boolean }>("/auth/login", data),
    logout: () => this.post<{ success: boolean }>("/auth/logout"),
  };

}

export const createApiClient = (options?: ApiClientOptions): ApiClient => {
  return new ApiClient(options);
};
