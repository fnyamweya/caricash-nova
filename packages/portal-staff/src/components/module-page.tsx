import { CircleCheck, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@caricash/ui';

export interface ModulePageProps {
    module: string;
    title: string;
    description: string;
    actions?: React.ReactNode;
    playbook?: string[];
    sidebar?: React.ReactNode;
    children: React.ReactNode;
}

export function ModulePage({
    module,
    title,
    description,
    actions,
    playbook = [],
    sidebar,
    children,
}: ModulePageProps) {
    return (
        <div className="flex flex-col gap-6 md:gap-7">
            <PageHeader
                title={title}
                description={description}
                badge={module}
                actions={actions}
            />

            <div className="grid gap-6 md:gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-6 md:space-y-7">{children}</div>

                <aside className="space-y-6">
                    {playbook.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Operator Playbook
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <ol className="space-y-2.5">
                                    {playbook.map((item) => (
                                        <li
                                            key={item}
                                            className="flex items-start gap-2 text-sm text-muted-foreground"
                                        >
                                            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ol>
                            </CardContent>
                        </Card>
                    ) : null}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Governance Notes
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-muted-foreground">
                            <p className="flex items-start gap-2">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                Keep correlation and idempotency values in ticket records for audit traceability.
                            </p>
                            <p className="flex items-start gap-2">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                Validate actor and account identifiers before submitting irreversible actions.
                            </p>
                        </CardContent>
                    </Card>

                    {sidebar}
                </aside>
            </div>
        </div>
    );
}
