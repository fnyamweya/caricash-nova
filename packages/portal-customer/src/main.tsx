import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@caricash/ui/globals.css';
import { AuthProvider, QueryProvider, ApiProvider, ThemeProvider } from '@caricash/ui';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.js';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryProvider>
            <ApiProvider baseUrl={import.meta.env.VITE_API_URL || ''}>
                <ThemeProvider
                    storageKeyPrefix="caricash_customer"
                    defaultActiveTheme="supabase"
                    defaultShellVariant="framed"
                >
                    <AuthProvider>
                        <RouterProvider router={router} />
                    </AuthProvider>
                </ThemeProvider>
            </ApiProvider>
        </QueryProvider>
    </StrictMode>,
);
