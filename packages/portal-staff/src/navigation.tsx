import {
    BookOpen,
    ClipboardCheck,
    Landmark,
    LayoutDashboard,
    Scale,
    Store,
    UserCog,
    Users,
} from 'lucide-react';

export type StaffNavGroup = 'Core' | 'Operations' | 'Controls';

export type StaffRouteHref =
    | '/dashboard'
    | '/customers'
    | '/agents'
    | '/merchants'
    | '/approvals'
    | '/ledger'
    | '/reconciliation'
    | '/overdraft';

export interface StaffNavItem {
    label: string;
    href: StaffRouteHref;
    icon: React.ReactNode;
    description: string;
    group: StaffNavGroup;
}

export const staffNavigation: StaffNavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard className="h-4 w-4" />,
        description: 'Operations posture, priorities, and module entry points',
        group: 'Core',
    },
    {
        label: 'Customers',
        href: '/customers',
        icon: <Users className="h-4 w-4" />,
        description: 'Customer onboarding and account administration',
        group: 'Core',
    },
    {
        label: 'Agents',
        href: '/agents',
        icon: <UserCog className="h-4 w-4" />,
        description: 'Agent lifecycle, float controls, and KYC workflows',
        group: 'Core',
    },
    {
        label: 'Merchants',
        href: '/merchants',
        icon: <Store className="h-4 w-4" />,
        description: 'Merchant and store provisioning workflows',
        group: 'Core',
    },
    {
        label: 'Approvals',
        href: '/approvals',
        icon: <ClipboardCheck className="h-4 w-4" />,
        description: 'Operational approvals and suspense funding requests',
        group: 'Operations',
    },
    {
        label: 'Overdraft',
        href: '/overdraft',
        icon: <Landmark className="h-4 w-4" />,
        description: 'Overdraft request and decision management',
        group: 'Operations',
    },
    {
        label: 'Ledger',
        href: '/ledger',
        icon: <BookOpen className="h-4 w-4" />,
        description: 'Journal inspection and ledger verification',
        group: 'Controls',
    },
    {
        label: 'Reconciliation',
        href: '/reconciliation',
        icon: <Scale className="h-4 w-4" />,
        description: 'Reconciliation runs, findings, and run history',
        group: 'Controls',
    },
];
