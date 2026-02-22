import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Badge,
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    EmptyState,
    Input,
    Label,
    LoadingSpinner,
    PageTransition,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useApi,
    useAuth,
} from '@caricash/ui';
import {
    CheckCircle,
    Loader2,
    MapPin,
    Network,
    Plus,
    Store,
    Trash2,
    Pencil,
} from 'lucide-react';
import { MerchantHero, MerchantMetricCard, MerchantSection, MerchantSegmentedFilters, MerchantStickyActionBar } from '../components/merchant-ui.js';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentNode {
    id: string;
    store_id: string;
    store_node_name: string;
    store_node_code: string;
    description?: string;
    status: string;
    is_primary: boolean;
    created_at: string;
    updated_at: string;
}

type StorePanel = 'stores' | 'payment-nodes';

// ---------------------------------------------------------------------------
// StoresPage
// ---------------------------------------------------------------------------

export function StoresPage() {
    const { actor } = useAuth();
    const api = useApi();
    const {
        stores,
        activeStore,
        activeStoreCode,
        setActiveStoreCode,
        storesQuery,
    } = useMerchantWorkspace();

    const [panel, setPanel] = useState<StorePanel>('stores');

    // Payment nodes state
    const [nodes, setNodes] = useState<PaymentNode[]>([]);
    const [nodesLoading, setNodesLoading] = useState(false);
    const [nodesError, setNodesError] = useState<string | null>(null);

    // Add node dialog
    const [addNodeOpen, setAddNodeOpen] = useState(false);
    const [nodeForm, setNodeForm] = useState({ name: '', code: '', description: '', is_primary: false });
    const [addNodeLoading, setAddNodeLoading] = useState(false);
    const [addNodeError, setAddNodeError] = useState<string | null>(null);

    // Edit node dialog
    const [editNode, setEditNode] = useState<PaymentNode | null>(null);
    const [editForm, setEditForm] = useState({ name: '', code: '', description: '', status: 'active', is_primary: false });
    const [editNodeLoading, setEditNodeLoading] = useState(false);

    // Delete node
    const [deleteNode, setDeleteNode] = useState<PaymentNode | null>(null);
    const [deleteNodeLoading, setDeleteNodeLoading] = useState(false);

    const selectedStoreId = activeStore?.id;

    // Fetch payment nodes when store selection or panel changes
    const fetchNodes = useCallback(async () => {
        if (!actor?.id || !selectedStoreId) {
            setNodes([]);
            return;
        }
        setNodesLoading(true);
        setNodesError(null);
        try {
            const res = await api.get<{ nodes: PaymentNode[] }>(
                `/merchants/${actor.id}/stores/${selectedStoreId}/payment-nodes`,
            );
            setNodes(res.nodes);
        } catch (err) {
            setNodesError(err instanceof Error ? err.message : 'Failed to load payment nodes');
        } finally {
            setNodesLoading(false);
        }
    }, [api, actor?.id, selectedStoreId]);

    useEffect(() => {
        if (panel === 'payment-nodes') {
            void fetchNodes();
        }
    }, [fetchNodes, panel]);

    async function handleAddNode() {
        if (!actor?.id || !selectedStoreId) return;
        setAddNodeLoading(true);
        setAddNodeError(null);
        try {
            await api.post(`/merchants/${actor.id}/stores/${selectedStoreId}/payment-nodes`, {
                store_node_name: nodeForm.name.trim(),
                store_node_code: nodeForm.code.trim(),
                description: nodeForm.description.trim() || undefined,
                is_primary: nodeForm.is_primary,
            });
            setAddNodeOpen(false);
            setNodeForm({ name: '', code: '', description: '', is_primary: false });
            await fetchNodes();
        } catch (err) {
            setAddNodeError(err instanceof Error ? err.message : 'Failed to create payment node');
        } finally {
            setAddNodeLoading(false);
        }
    }

    async function handleEditNode() {
        if (!actor?.id || !selectedStoreId || !editNode) return;
        setEditNodeLoading(true);
        try {
            await api.put(`/merchants/${actor.id}/stores/${selectedStoreId}/payment-nodes/${editNode.id}`, {
                store_node_name: editForm.name.trim() || undefined,
                store_node_code: editForm.code.trim() || undefined,
                description: editForm.description.trim() || undefined,
                status: editForm.status,
                is_primary: editForm.is_primary,
            });
            setEditNode(null);
            await fetchNodes();
        } catch {
            // noop
        } finally {
            setEditNodeLoading(false);
        }
    }

    async function handleDeleteNode() {
        if (!actor?.id || !selectedStoreId || !deleteNode) return;
        setDeleteNodeLoading(true);
        try {
            await api.delete(`/merchants/${actor.id}/stores/${selectedStoreId}/payment-nodes/${deleteNode.id}`);
            setDeleteNode(null);
            await fetchNodes();
        } catch {
            // noop
        } finally {
            setDeleteNodeLoading(false);
        }
    }

    const primaryNode = useMemo(() => nodes.find((n) => n.is_primary), [nodes]);
    const activeNodes = useMemo(() => nodes.filter((n) => n.status === 'active'), [nodes]);

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="Store Management"
                    description="Select a store to manage and configure payment nodes for each location."
                    badge={activeStoreCode ? `Store: ${activeStoreCode}` : 'No store selected'}
                    actions={(
                        <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">
                            {stores.length} store{stores.length === 1 ? '' : 's'}
                        </Badge>
                    )}
                >
                    <div className="grid gap-3 sm:grid-cols-3">
                        <MerchantMetricCard label="Total Stores" value={`${stores.length}`} />
                        <MerchantMetricCard label="Payment Nodes" value={`${nodes.length}`} />
                        <MerchantMetricCard label="Active Nodes" value={`${activeNodes.length}`} />
                    </div>
                </MerchantHero>

                {/* Store selector — always visible */}
                <MerchantSection title="Select Store" description="Choose which store to manage. This controls the active context for payment nodes and team.">
                    {storesQuery.isLoading ? (
                        <div className="flex justify-center py-6"><LoadingSpinner /></div>
                    ) : stores.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {stores.map((store) => (
                                <button
                                    key={store.store_code}
                                    type="button"
                                    onClick={() => setActiveStoreCode(store.store_code)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm transition-colors',
                                        activeStoreCode === store.store_code
                                            ? 'border-emerald-300 bg-emerald-500/8 font-semibold text-emerald-800'
                                            : 'border-border/70 hover:bg-accent/30',
                                    )}
                                >
                                    <Store className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{store.name}</span>
                                    <Badge variant="outline" className="rounded-full text-[10px]">{store.store_code}</Badge>
                                    {store.is_primary ? <Badge className="rounded-full bg-amber-500/12 text-amber-700 text-[10px]">Primary</Badge> : null}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={<Store />} title="No stores" description="Create your first store in Settings → Stores." />
                    )}
                </MerchantSection>

                {/* Panel selector */}
                <MerchantSection title="Manage" description="Switch between store details and payment nodes.">
                    <MerchantSegmentedFilters<StorePanel>
                        value={panel}
                        onChange={setPanel}
                        options={[
                            { value: 'stores', label: 'Store Details' },
                            { value: 'payment-nodes', label: 'Payment Nodes', count: nodes.length },
                        ]}
                    />
                </MerchantSection>

                <AnimatePresence mode="wait" initial={false}>
                    {panel === 'stores' && activeStore ? (
                        <motion.div key="store-details" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                            <MerchantSection title={activeStore.name} description={`Store Code: ${activeStore.store_code}`}>
                                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                                    <ReadOnlyRow label="Name" value={activeStore.name} />
                                    <ReadOnlyRow label="Legal Name" value={activeStore.legal_name || '—'} />
                                    <ReadOnlyRow label="Store Code" value={activeStore.store_code} mono />
                                    <ReadOnlyRow label="Status" value={activeStore.status || activeStore.state || '—'} />
                                    <ReadOnlyRow label="Primary" value={activeStore.is_primary ? 'Yes' : 'No'} />
                                    {activeStore.location ? (
                                        <ReadOnlyRow label="Location" value={[
                                            (activeStore.location as Record<string, string>)?.address,
                                            (activeStore.location as Record<string, string>)?.city,
                                            (activeStore.location as Record<string, string>)?.country,
                                        ].filter(Boolean).join(', ') || '—'} />
                                    ) : null}
                                    <ReadOnlyRow label="Created" value={activeStore.created_at ?? '—'} />
                                </div>
                            </MerchantSection>
                        </motion.div>
                    ) : null}

                    {panel === 'payment-nodes' ? (
                        <motion.div key="payment-nodes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                            <MerchantSection title="Payment Nodes" description={`Payment nodes for store ${activeStoreCode || '(none selected)'}`}>
                                {!selectedStoreId ? (
                                    <EmptyState icon={<Store />} title="No store selected" description="Select a store above to view its payment nodes." />
                                ) : nodesLoading ? (
                                    <div className="flex justify-center py-8"><LoadingSpinner /></div>
                                ) : nodesError ? (
                                    <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">{nodesError}</div>
                                ) : nodes.length > 0 ? (
                                    <div className="space-y-2">
                                        {nodes.map((node) => (
                                            <div
                                                key={node.id}
                                                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-3 text-sm"
                                            >
                                                <div className="min-w-0 flex items-center gap-3">
                                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                                                        <Network className="h-4 w-4" />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-semibold">{node.store_node_name}{node.is_primary ? ' ★' : ''}</span>
                                                        <span className="block truncate text-xs text-muted-foreground">{node.store_node_code}{node.description ? ` — ${node.description}` : ''}</span>
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Badge variant="outline" className="rounded-full">{node.status}</Badge>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0" onClick={() => {
                                                        setEditNode(node);
                                                        setEditForm({ name: node.store_node_name, code: node.store_node_code, description: node.description ?? '', status: node.status, is_primary: node.is_primary });
                                                    }}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 text-rose-600 hover:text-rose-700" onClick={() => setDeleteNode(node)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState icon={<Network />} title="No payment nodes" description="Add a payment node to start accepting payments at this store." />
                                )}
                            </MerchantSection>

                            <MerchantSection title="Add Payment Node" description="Create a new payment endpoint for this store.">
                                <div className="space-y-3">
                                    <Field label="Node Name" htmlFor="pn-name">
                                        <Input id="pn-name" value={nodeForm.name} onChange={(e) => setNodeForm((p) => ({ ...p, name: e.target.value }))} className="h-11 rounded-xl" placeholder="Counter 1" />
                                    </Field>
                                    <Field label="Node Code" htmlFor="pn-code">
                                        <Input id="pn-code" value={nodeForm.code} onChange={(e) => setNodeForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} className="h-11 rounded-xl" placeholder="POS-001" />
                                    </Field>
                                    <Field label="Description (optional)" htmlFor="pn-desc">
                                        <Input id="pn-desc" value={nodeForm.description} onChange={(e) => setNodeForm((p) => ({ ...p, description: e.target.value }))} className="h-11 rounded-xl" placeholder="Main cash register" />
                                    </Field>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={nodeForm.is_primary} onChange={(e) => setNodeForm((p) => ({ ...p, is_primary: e.target.checked }))} className="rounded" />
                                        Set as primary node
                                    </label>
                                    {addNodeError ? (
                                        <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">{addNodeError}</div>
                                    ) : null}
                                    <Button
                                        className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90"
                                        disabled={!nodeForm.name.trim() || !nodeForm.code.trim() || !selectedStoreId || addNodeLoading}
                                        onClick={() => void handleAddNode()}
                                    >
                                        {addNodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        {addNodeLoading ? 'Creating…' : 'Add Payment Node'}
                                    </Button>
                                </div>
                            </MerchantSection>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                <MerchantStickyActionBar
                    title="Manage stores and payment nodes"
                    subtitle="Select a store above and switch between store details and payment nodes to configure your merchant locations."
                    secondary={<Button variant="outline" className="w-full rounded-xl sm:w-auto" onClick={() => void storesQuery.refetch()}>Refresh</Button>}
                    primary={
                        panel === 'payment-nodes' ? (
                            <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto" disabled={!selectedStoreId} onClick={() => setAddNodeOpen(true)}>
                                <Plus className="h-4 w-4" />
                                Add Node
                            </Button>
                        ) : null
                    }
                />
            </div>

            {/* Edit node dialog */}
            <Dialog open={!!editNode} onOpenChange={(open) => !open && setEditNode(null)}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Payment Node</DialogTitle>
                        <DialogDescription>Update this payment node&apos;s details.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Field label="Node Name" htmlFor="edit-pn-name">
                            <Input id="edit-pn-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-11 rounded-xl" />
                        </Field>
                        <Field label="Node Code" htmlFor="edit-pn-code">
                            <Input id="edit-pn-code" value={editForm.code} onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} className="h-11 rounded-xl" />
                        </Field>
                        <Field label="Description" htmlFor="edit-pn-desc">
                            <Input id="edit-pn-desc" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} className="h-11 rounded-xl" />
                        </Field>
                        <Field label="Status" htmlFor="edit-pn-status">
                            <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))}>
                                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="suspended">Suspended</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.is_primary} onChange={(e) => setEditForm((p) => ({ ...p, is_primary: e.target.checked }))} className="rounded" />
                            Set as primary node
                        </label>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
                        <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-600/90" disabled={editNodeLoading} onClick={() => void handleEditNode()}>
                            {editNodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete confirm dialog */}
            <Dialog open={!!deleteNode} onOpenChange={(open) => !open && setDeleteNode(null)}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Delete Payment Node</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete &ldquo;{deleteNode?.store_node_name}&rdquo;? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
                        <Button variant="destructive" className="rounded-xl" disabled={deleteNodeLoading} onClick={() => void handleDeleteNode()}>
                            {deleteNodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageTransition>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
        </div>
    );
}

function ReadOnlyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className={cn('max-w-[60%] text-right text-sm font-medium break-words', mono && 'font-mono text-xs')}>{value}</span>
        </div>
    );
}

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}
