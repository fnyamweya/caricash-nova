export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly body?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

interface RequestOptions {
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            body = await response.text().catch(() => null);
        }
        const message =
            body && typeof body === 'object' && 'error' in body
                ? String((body as { error: string }).error)
                : body && typeof body === 'object' && 'message' in body
                  ? String((body as { message: string }).message)
                  : `Request failed with status ${response.status}`;
        throw new ApiError(response.status, message, body);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem('caricash_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const staffId = localStorage.getItem('caricash_staff_id');
    if (staffId) {
        headers['X-Staff-Id'] = staffId;
    }
    return headers;
}

export function createApiClient(baseUrl: string) {
    function buildUrl(path: string): string {
        return `${baseUrl}${path}`;
    }

    function buildHeaders(options?: RequestOptions): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...options?.headers,
        };
    }

    return {
        async get<T>(path: string, options?: RequestOptions): Promise<T> {
            const response = await fetch(buildUrl(path), {
                method: 'GET',
                headers: buildHeaders(options),
                signal: options?.signal,
            });
            return handleResponse<T>(response);
        },

        async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
            const response = await fetch(buildUrl(path), {
                method: 'POST',
                headers: buildHeaders(options),
                body: body != null ? JSON.stringify(body) : undefined,
                signal: options?.signal,
            });
            return handleResponse<T>(response);
        },

        async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
            const response = await fetch(buildUrl(path), {
                method: 'PUT',
                headers: buildHeaders(options),
                body: body != null ? JSON.stringify(body) : undefined,
                signal: options?.signal,
            });
            return handleResponse<T>(response);
        },

        async delete<T>(path: string, options?: RequestOptions): Promise<T> {
            const response = await fetch(buildUrl(path), {
                method: 'DELETE',
                headers: buildHeaders(options),
                signal: options?.signal,
            });
            return handleResponse<T>(response);
        },
    };
}

export type ApiClient = ReturnType<typeof createApiClient>;
