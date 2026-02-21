import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@caricash/ui/globals.css';
import { AuthProvider, QueryProvider, ApiProvider } from '@caricash/ui';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.js';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryProvider>
            <ApiProvider baseUrl={import.meta.env.VITE_API_URL || ''}>
                <AuthProvider>
                    <RouterProvider router={router} />
                </AuthProvider>
            </ApiProvider>
        </QueryProvider>
    </StrictMode>,
);
