import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi, useAuth } from '@caricash/ui';

const WORKSPACE_STORAGE_KEY = 'caricash_merchant_workspace';
const LEGACY_STORE_CODE_KEY = 'caricash_store_code';
const STORE_EVENT_NAME = 'caricash:merchant-store-change';

export interface MerchantStoreRecord {
    id: string;
    merchant_id?: string;
    name: string;
    legal_name?: string;
    store_code: string;
    is_primary?: boolean;
    location?: Record<string, unknown> | null;
    status?: string;
    kyc_profile?: string | null;
    created_at?: string;
    updated_at?: string;
    source?: 'api' | 'local';
    /** @deprecated kept for backward compat with old actor-based store shape */
    state?: string;
    kyc_state?: string;
    parent_actor_id?: string | null;
}

interface MerchantStoresResponse {
    stores: MerchantStoreRecord[];
    count: number;
}

interface WorkspacePersistence {
    active_store_code?: string;
    saved_stores?: MerchantStoreRecord[];
    prefs?: {
        settlementBankName?: string;
        settlementAccountName?: string;
        settlementAccountNo?: string;
        settlementFrequency?: 'manual' | 'daily' | 'weekly';
        settlementThreshold?: string;
        notifications?: {
            payments: boolean;
            settlements: boolean;
            team: boolean;
            risk: boolean;
        };
    };
}

function readWorkspace(): WorkspacePersistence {
    if (typeof window === 'undefined') return {};

    try {
        const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as WorkspacePersistence;
    } catch {
        return {};
    }
}

function writeWorkspace(next: WorkspacePersistence) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
}

function sanitizeStoreRecord(store: Partial<MerchantStoreRecord>): MerchantStoreRecord | null {
    const code = (store.store_code ?? '').trim();
    if (!code) return null;
    return {
        id: (store.id ?? `local:${code}`).toString(),
        name: (store.name ?? code).trim() || code,
        store_code: code,
        state: store.state ?? 'ACTIVE',
        kyc_state: store.kyc_state ?? 'UNKNOWN',
        parent_actor_id: store.parent_actor_id ?? null,
        created_at: store.created_at,
        source: store.source ?? 'local',
    };
}

function mergeStores(...groups: Array<MerchantStoreRecord[] | undefined>): MerchantStoreRecord[] {
    const seen = new Map<string, MerchantStoreRecord>();
    for (const group of groups) {
        for (const store of group ?? []) {
            const normalized = sanitizeStoreRecord(store);
            if (!normalized) continue;
            const existing = seen.get(normalized.store_code);
            seen.set(normalized.store_code, {
                ...existing,
                ...normalized,
                name: normalized.name || existing?.name || normalized.store_code,
            });
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function setActiveMerchantStore(storeCode: string) {
    if (typeof window === 'undefined') return;
    const code = storeCode.trim();
    if (!code) return;

    const current = readWorkspace();
    writeWorkspace({
        ...current,
        active_store_code: code,
    });
    localStorage.setItem(LEGACY_STORE_CODE_KEY, code);
    window.dispatchEvent(new CustomEvent(STORE_EVENT_NAME, { detail: { store_code: code } }));
}

export function useMerchantWorkspace() {
    const api = useApi();
    const { actor } = useAuth();
    const [workspace, setWorkspace] = useState<WorkspacePersistence>(() => readWorkspace());

    const storesQuery = useQuery<MerchantStoresResponse>({
        queryKey: ['merchant-stores-workspace', actor?.id],
        queryFn: () => api.get<MerchantStoresResponse>(`/merchants/${actor!.id}/stores`),
        enabled: !!actor?.id,
        staleTime: 60_000,
    });

    useEffect(() => {
        const sync = () => setWorkspace(readWorkspace());
        window.addEventListener(STORE_EVENT_NAME, sync as EventListener);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(STORE_EVENT_NAME, sync as EventListener);
            window.removeEventListener('storage', sync);
        };
    }, []);

    const savedStores = useMemo(
        () => (workspace.saved_stores ?? []).map((store) => ({ ...store, source: 'local' as const })),
        [workspace.saved_stores],
    );

    const apiStores = useMemo(
        () => (storesQuery.data?.stores ?? []).map((store) => ({ ...store, source: 'api' as const })),
        [storesQuery.data?.stores],
    );

    const legacyStoreCode = typeof window !== 'undefined' ? localStorage.getItem(LEGACY_STORE_CODE_KEY) ?? '' : '';
    const actorFallbackStore = actor?.name && /^[A-Z0-9_-]{3,}$/i.test(actor.name)
        ? sanitizeStoreRecord({ store_code: actor.name, name: actor.name, source: 'local' })
        : null;

    const stores = useMemo(
        () => mergeStores(apiStores, savedStores, actorFallbackStore ? [actorFallbackStore] : undefined),
        [apiStores, savedStores, actorFallbackStore],
    );

    const activeStoreCode = workspace.active_store_code
        ?? legacyStoreCode
        ?? stores[0]?.store_code
        ?? '';

    const activeStore = stores.find((store) => store.store_code === activeStoreCode) ?? stores[0] ?? null;

    useEffect(() => {
        if (!activeStore?.store_code) return;
        const needsPersist = workspace.active_store_code !== activeStore.store_code
            || localStorage.getItem(LEGACY_STORE_CODE_KEY) !== activeStore.store_code;
        if (!needsPersist) return;
        setActiveMerchantStore(activeStore.store_code);
        setWorkspace(readWorkspace());
    }, [activeStore?.store_code, workspace.active_store_code]);

    function patchWorkspace(next: Partial<WorkspacePersistence>) {
        const merged = {
            ...readWorkspace(),
            ...next,
        } satisfies WorkspacePersistence;
        writeWorkspace(merged);
        setWorkspace(merged);
    }

    function rememberStore(store: Partial<MerchantStoreRecord>) {
        const normalized = sanitizeStoreRecord({ ...store, source: 'local' });
        if (!normalized) return;
        const merged = mergeStores(workspace.saved_stores, [normalized]);
        patchWorkspace({ saved_stores: merged });
    }

    function updatePreferences(nextPrefs: NonNullable<WorkspacePersistence['prefs']>) {
        patchWorkspace({ prefs: nextPrefs });
    }

    function setActiveStoreCode(storeCode: string) {
        if (!storeCode) return;
        setActiveMerchantStore(storeCode);
        setWorkspace(readWorkspace());
    }

    return {
        stores,
        activeStore,
        activeStoreCode: activeStore?.store_code ?? activeStoreCode,
        setActiveStoreCode,
        rememberStore,
        storesQuery,
        preferences: workspace.prefs,
        updatePreferences,
    };
}
