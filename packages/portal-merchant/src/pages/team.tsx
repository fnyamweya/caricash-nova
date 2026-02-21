import { useCallback, useEffect, useState } from 'react';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    PageHeader,
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
    Users,
    Plus,
    Crown,
    Shield,
    UserCog,
    Eye,
    Trash2,
    Loader2,
    CheckCircle,
    AlertTriangle,
} from 'lucide-react';

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

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    store_owner: { label: 'Store Owner', icon: <Crown className="h-3.5 w-3.5" />, color: 'text-amber-600' },
    manager: { label: 'Manager', icon: <Shield className="h-3.5 w-3.5" />, color: 'text-blue-600' },
    cashier: { label: 'Cashier', icon: <UserCog className="h-3.5 w-3.5" />, color: 'text-green-600' },
    viewer: { label: 'Viewer', icon: <Eye className="h-3.5 w-3.5" />, color: 'text-gray-500' },
};

function getStoreCode(): string {
    return localStorage.getItem('caricash_store_code') || '';
}

export function TeamPage() {
    const { actor } = useAuth();
    const api = useApi();
    const storeCode = getStoreCode();

    const [users, setUsers] = useState<MerchantUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add user dialog state
    const [addOpen, setAddOpen] = useState(false);
    const [addMsisdn, setAddMsisdn] = useState('');
    const [addName, setAddName] = useState('');
    const [addRole, setAddRole] = useState('cashier');
    const [addPin, setAddPin] = useState('');
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addSuccess, setAddSuccess] = useState(false);

    // Remove user dialog state
    const [removeUser, setRemoveUser] = useState<MerchantUser | null>(null);
    const [removeLoading, setRemoveLoading] = useState(false);

    const fetchUsers = useCallback(async () => {
        if (!storeCode) return;
        setLoading(true);
        setError(null);
        try {
            const result = await api.get<{ users: MerchantUser[] }>(
                `/merchants/${encodeURIComponent(storeCode)}/users`,
            );
            setUsers(result.users);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch team members');
        } finally {
            setLoading(false);
        }
    }, [api, storeCode]);

    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    async function handleAddUser() {
        if (!addMsisdn.trim() || !addName.trim() || !addPin.trim()) return;
        setAddLoading(true);
        setAddError(null);

        try {
            await api.post(`/merchants/${encodeURIComponent(storeCode)}/users`, {
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
            }, 1500);
        } catch (err) {
            setAddError(err instanceof Error ? err.message : 'Failed to add user');
        } finally {
            setAddLoading(false);
        }
    }

    async function handleRemoveUser() {
        if (!removeUser) return;
        setRemoveLoading(true);
        try {
            await api.delete(
                `/merchants/${encodeURIComponent(storeCode)}/users/${removeUser.id}`,
            );
            setRemoveUser(null);
            await fetchUsers();
        } catch {
            // Silently handle — could show error
        } finally {
            setRemoveLoading(false);
        }
    }

    const canAddUser = addMsisdn.trim().length >= 1 && addName.trim().length >= 1 && addPin.trim().length >= 4;

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Team Management"
                    description="Manage staff and users who can access your merchant account."
                    badge="Users"
                />

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Users className="h-4 w-4 text-primary" />
                                    Team Members
                                </CardTitle>
                                <CardDescription>
                                    {users.length} {users.length === 1 ? 'member' : 'members'}
                                </CardDescription>
                            </div>
                            <Button size="sm" onClick={() => setAddOpen(true)}>
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Add User
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                <span>Loading team...</span>
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center gap-2 py-8 text-destructive">
                                <AlertTriangle className="h-5 w-5" />
                                <span>{error}</span>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="py-8 text-center text-muted-foreground">
                                <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                                <p className="text-sm">No team members yet.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/70">
                                {users.map((user) => {
                                    const roleInfo = ROLE_LABELS[user.role] || ROLE_LABELS.viewer;
                                    return (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between gap-4 py-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                                                    {user.name[0] || '?'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold">
                                                        {user.name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {user.msisdn}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Badge
                                                    variant="outline"
                                                    className={`gap-1 ${roleInfo.color}`}
                                                >
                                                    {roleInfo.icon}
                                                    {roleInfo.label}
                                                </Badge>
                                                {user.role !== 'store_owner' ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() => setRemoveUser(user)}
                                                        aria-label={`Remove ${user.name}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Add User Dialog */}
            <Dialog
                open={addOpen}
                onOpenChange={(open) => {
                    setAddOpen(open);
                    if (!open) {
                        setAddError(null);
                        setAddSuccess(false);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Team Member</DialogTitle>
                        <DialogDescription>
                            Add a new user to your merchant account. They will be able to log in with their PIN.
                        </DialogDescription>
                    </DialogHeader>

                    {addSuccess ? (
                        <div className="flex flex-col items-center gap-2 py-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                                <CheckCircle className="h-6 w-6 text-green-500" />
                            </div>
                            <p className="font-semibold">User added successfully!</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="add-msisdn">Phone Number</Label>
                                    <Input
                                        id="add-msisdn"
                                        type="tel"
                                        placeholder="246XXXXXXX"
                                        value={addMsisdn}
                                        onChange={(e) => setAddMsisdn(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="add-name">Display Name</Label>
                                    <Input
                                        id="add-name"
                                        placeholder="John Doe"
                                        value={addName}
                                        onChange={(e) => setAddName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="add-role">Role</Label>
                                    <Select value={addRole} onValueChange={setAddRole}>
                                        <SelectTrigger id="add-role">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="manager">Manager</SelectItem>
                                            <SelectItem value="cashier">Cashier</SelectItem>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="add-pin">PIN (4-6 digits)</Label>
                                    <Input
                                        id="add-pin"
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder="Enter PIN"
                                        value={addPin}
                                        onChange={(e) => setAddPin(e.target.value)}
                                    />
                                </div>
                            </div>

                            {addError ? (
                                <p className="text-sm text-destructive">{addError}</p>
                            ) : null}

                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline" disabled={addLoading}>
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button
                                    onClick={handleAddUser}
                                    disabled={!canAddUser || addLoading}
                                >
                                    {addLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Adding...
                                        </>
                                    ) : (
                                        'Add User'
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Remove User Confirmation */}
            <Dialog open={!!removeUser} onOpenChange={(open) => !open && setRemoveUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove Team Member</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove{' '}
                            <span className="font-semibold">{removeUser?.name}</span>?
                            They will no longer be able to access this merchant account.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" disabled={removeLoading}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            onClick={handleRemoveUser}
                            disabled={removeLoading}
                        >
                            {removeLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                'Remove User'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageTransition>
    );
}
