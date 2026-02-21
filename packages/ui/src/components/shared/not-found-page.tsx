import { Compass, SearchX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.js';
import { Button } from '../ui/button.js';

export interface NotFoundPageProps {
    title?: string;
    description?: string;
    homeHref?: string;
    homeLabel?: string;
}

export function NotFoundPage({
    title = 'Page not found',
    description = 'The page you are looking for does not exist or may have been moved.',
    homeHref = '/',
    homeLabel = 'Go home',
}: NotFoundPageProps) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-8 sm:px-6">
            <Card className="w-full max-w-lg text-center">
                <CardHeader className="items-center">
                    <div className="mb-3 rounded-2xl bg-muted p-3 text-muted-foreground">
                        <SearchX className="h-7 w-7" />
                    </div>
                    <CardTitle className="text-2xl">404 · {title}</CardTitle>
                    <CardDescription className="max-w-md">{description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Button variant="outline" onClick={() => window.history.back()}>
                        Go back
                    </Button>
                    <Button asChild>
                        <a href={homeHref}>
                            <Compass className="h-4 w-4" />
                            {homeLabel}
                        </a>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
