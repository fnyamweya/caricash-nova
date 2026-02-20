/// <reference types="@cloudflare/workers-types" />
/// <reference types="@cloudflare/workers-types/experimental" />

// Minimal fallbacks if worker globals are not picked up by TS build.
declare global {
    abstract class D1Database {
        prepare(query: string): D1PreparedStatement;
        batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
        exec(query: string): Promise<unknown>;
    }

    abstract class D1PreparedStatement {
        bind(...values: unknown[]): D1PreparedStatement;
        first<T = unknown>(colName?: string): Promise<T | null>;
        run(): Promise<unknown>;
        all<T = unknown>(): Promise<{ results: T[] }>;
        raw<T = unknown>(): Promise<T[]>;
    }

    abstract class DurableObjectNamespace {
        idFromName(name: string): DurableObjectId;
        get(id: DurableObjectId): unknown;
    }

    interface DurableObjectState {
        blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
    }

    interface DurableObject {
        fetch(request: Request): Response | Promise<Response>;
        alarm?(alarmInfo?: unknown): void | Promise<void>;
    }

    interface DurableObjectId {
        toString(): string;
    }
}

export { };
