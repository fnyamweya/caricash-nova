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
    AlertTriangle,
    CheckCircle,
    Crown,
    Eye,
    Loader2,
    Plus,
    Shield,
    Store,
    Trash2,
    UserCog,
    Users,
} from 'lucide-react';
import { MerchantHero, MerchantMetricCard, MerchantSection, MerchantStickyActionBar } from '../components/merchant-ui.js';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';

interface MerchantUser {
    id: string;
    actor_id: string;
    msisdn: string;
    name: string;
    role: string;
    state: string;
    created_at: string;
    updated_at: string;
}

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
    store_owner: { label: 'Store Owner', icon: <Crown className="h-3.5 w-3.5" />, tone: 'text-amber-700' },
    manager: { label: 'Manager', icon: <Shield className="h-3.5 w-3.5" />, tone: 'text-blue-700' },
    cashier: { label: 'Cashier', icon: <UserCog className="h-3.5 w-3.5" />, tone: 'text-emerald-700' },
    viewer: { label: 'Viewer', icon: <Eye className="h-3.5 w-3.5" />, tone: 'text-slate-700' },
};

export function TeamPage() {
    const { actor } = useAuth();
    const api = useApi();
    const { activeStoreCode, activeStore } = useMerchantWorkspace();

    const [users, setUsers] = useState<MerchantUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [addOpen, setAddOpen] = useState(false);
    const [addMsisdn, setAddMsisdn] = useState('');
    const [addName, setAddName] = useState('');
    const [addRole, setAddRole] = useState('cashier');
    const [addPin, setAddPin] = useState('');
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addSuccess, setAddSuccess] = useState(false);

    const [removeUser, setRemoveUser] = useState<MerchantUser | null>(null);
    const [removeLoading, setRemoveLoading] = useState(false);

    const fetchUsers = useCallback(async () => {
        if (!activeStoreCode) {
            setUsers([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await api.get<{ users: MerchantUser[] }>(`/merchants/${encodeURIComponent(activeStoreCode)}/users`);
            setUsers(result.users);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load team members');
        } finally {
            setLoading(false);
        }
    }, [api, activeStoreCode]);

    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    async function handleAddUser() {
        if (!activeStoreCode) return;
        if (!addMsisdn.trim() || !addName.trim() || !addPin.trim()) return;
        setAddLoading(true);
        setAddError(null);
        try {
            await api.post(`/merchants/${encodeURIComponent(activeStoreCode)}/users`, {
                msisdn: addMsisdn.trim(),
                name: addName.trim(),
                role: addRole,
                pin: addPin,
            });
            setAddSuccess(true);
            setAddMsisdn('');
            setAddName('');
            setAddRole('cashier');
            setAddPin('');
            await fetchUsers();
            setTimeout(() => {
                setAddOpen(false);
                setAddSuccess(false);
            }, 1000);
        } catch (err) {
            setAddError(err instanceof Error ? err.message : 'Failed to add team user');
        } finally {
            setAddLoading(false);
        }
    }

    async function handleRemoveUser() {
        if (!removeUser || !activeStoreCode) return;
        setRemoveLoading(true);
        try {
            await api.delete(`/merchants/${encodeURIComponent(activeStoreCode)}/users/${removeUser.id}`);
            setRemoveUser(null);
            await fetchUsers();
        } catch {
            // noop
        } finally {
            setRemoveLoading(false);
        }
    }

    const counts = useMemo(() => ({
        total: users.length,
        managers: users.filter((user) => user.role === 'manager').length,
        cashiers: users.filter((user) => user.role === 'cashier').length,
        active: users.filter((user) => user.state === 'ACTIVE').length,
    }), [users]);

    const canAddUser = !!activeStoreCode && addMsisdn.trim().length > 0 && addName.trim().length > 0 && addPin.trim().length >= 4;

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="Store Team Workspace"
                    description="Manage cashiers, managers, and branch users in the context of the active store so roles stay organized and operationally clear."
                    badge={activeStoreCode ? `Team for ${activeStoreCode}` : 'Select active store'}
                    actions={(
                        <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-600/90" onClick={() => setAddOpen(true)} disabled={!activeStoreCode}>
                            <Plus className="h-4 w-4" />
                            Add Team Member
                        </Button>
                    )}
                >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MerchantMetricCard label="Store" value={activeStore?.name ?? 'No store selected'} helper={activeStoreCode || 'Use the sidebar store switcher'} icon={<Store className="h-4 w-4" />} tone="slate" />
                        <MerchantMetricCard label="Team members" value={counts.total} helper="Current users for active store" icon={<Users className="h-4 w-4" />} tone="emerald" />
                        <MerchantMetricCard label="Cashiers" value={counts.cashiers} helper={`${counts.managers} manager(s)`} icon={<UserCog className="h-4 w-4" />} tone="blue" />
                        <MerchantMetricCard label="Active" value={counts.active} helper="Users with active state" icon={<Shield className="h-4 w-4" />} tone="amber" />
                    </div>
                </MerchantHero>

                <MerchantSection title="Team Directory" description="Tap members to review roles. Remove non-owner users when needed.">
                    {!activeStoreCode ? (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 p-6 text-center text-sm text-muted-foreground">
                            Select an active store from the sidebar to manage that store's team members.
                        </div>
                    ) : loading ? (
                        <div className="flex justify-center py-12"><LoadingSpinner /></div>
                    ) : error ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-4 text-sm text-rose-700">{error}</div>
                    ) : users.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 p-6 text-center">
                            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/70" />
                            <p className="text-sm font-semibold">No team members yet</p>
                            <p className="mt-1 text-xs text-muted-foreground">Add cashiers or managers to support collections at this store.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <AnimatePresence initial={false}>
                                {users.map((user) => {
                                    const roleInfo = ROLE_LABELS[user.role] || ROLE_LABELS.viewer;
                                    const removable = user.role !== 'store_owner';
                                    return (
                                        <motion.div
                                            key={user.id}
                                            layout
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/80 p-3"
                                        >
                                            <div className="min-w-0 flex items-center gap-3">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-sm font-semibold uppercase text-emerald-700">
                                                    {user.name[0] || '?'}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold">{user.name}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{user.msisdn}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="outline" className={cn('gap-1 rounded-full border-border/70', roleInfo.tone)}>
                                                    {roleInfo.icon}
                                                    {roleInfo.label}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full">{user.state}</Badge>
                                                {removable ? (
                                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700" onClick={() => setRemoveUser(user)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </MerchantSection>

                <MerchantStickyActionBar
                    title={activeStoreCode ? `Team actions for ${activeStoreCode}` : 'Select a store to manage team'}
                    subtitle="Store-level staff management keeps cashier access and permissions scoped correctly."
                    secondary={<Button variant="outline" className="w-full rounded-xl sm:w-auto" onClick={() => void fetchUsers()} disabled={!activeStoreCode || loading}>Refresh Team</Button>}
                    primary={<Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto" onClick={() => setAddOpen(true)} disabled={!activeStoreCode}><Plus className="h-4 w-4" />Add Team Member</Button>}
                />
            </div>

            <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setAddError(null); setAddSuccess(false); } }}>
                <DialogContent className="rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>Add Team Member</DialogTitle>
                        <DialogDescription>
                            Create a user for {activeStoreCode || 'the active store'} with role-based access and PIN login.
                        </DialogDescription>
                    </DialogHeader>

                    {addSuccess ? (
                        <div className="flex flex-col items-center gap-2 py-5 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                                <CheckCircle className="h-6 w-6" />
                            </div>
                            <p className="font-semibold">Team member added</p>
                            <p className="text-sm text-muted-foreground">They can now sign in using the store authentication flow.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Phone Number (MSISDN)" htmlFor="team-msisdn">
                                    <Input id="team-msisdn" type="tel" value={addMsisdn} onChange={(e) => setAddMsisdn(e.target.value)} className="h-11 rounded-xl" placeholder="+1246..." />
                                </Field>
                                <Field label="Display Name" htmlFor="team-name">
                                    <Input id="team-name" value={addName} onChange={(e) => setAddName(e.target.value)} className="h-11 rounded-xl" placeholder="Jane Smith" />
                                </Field>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Role" htmlFor="team-role">
                                    <Select value={addRole} onValueChange={setAddRole}>
                                        <SelectTrigger id="team-role" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="manager">Manager</SelectItem>
                                            <SelectItem value="cashier">Cashier</SelectItem>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field label="PIN (4-6 digits)" htmlFor="team-pin">
                                    <Input id="team-pin" type="password" inputMode="numeric" maxLength={6} value={addPin} onChange={(e) => setAddPin(e.target.value)} className="h-11 rounded-xl" placeholder="Enter PIN" />
                                </Field>
                            </div>
                            {addError ? <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">{addError}</div> : null}
                            <DialogFooter>
                                <DialogClose asChild><Button variant="outline" className="rounded-xl" disabled={addLoading}>Cancel</Button></DialogClose>
                                <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-600/90" disabled={!canAddUser || addLoading} onClick={handleAddUser}>
                                    {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    {addLoading ? 'Adding…' : 'Add Team Member'}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!removeUser} onOpenChange={(open) => !open && setRemoveUser(null)}>
                <DialogContent className="rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>Remove Team Member</DialogTitle>
                        <DialogDescription>
                            Remove <span className="font-semibold">{removeUser?.name}</span> from {activeStoreCode || 'this store'}? They will no longer be able to sign in for store operations.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-2xl border border-amber-200 bg-amber-500/8 p-3 text-sm text-amber-700">
                        <AlertTriangle className="mr-1 inline h-4 w-4" />
                        This action removes access immediately.
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline" className="rounded-xl" disabled={removeLoading}>Cancel</Button></DialogClose>
                        <Button variant="destructive" className="rounded-xl" onClick={handleRemoveUser} disabled={removeLoading}>
                            {removeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            {removeLoading ? 'Removing…' : 'Remove User'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageTransition>
    );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
        </div>
    );
}

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}
