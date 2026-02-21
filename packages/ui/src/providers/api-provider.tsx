import { createContext, useContext, useState, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from '../lib/api.js';

export { createApiClient } from '../lib/api.js';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ baseUrl = '', children }: { baseUrl?: string; children: ReactNode }) {
    const [client] = useState(() => createApiClient(baseUrl));

    return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
    const context = useContext(ApiContext);
    if (!context) {
        throw new Error('useApi must be used within an ApiProvider');
    }
    return context;
}
