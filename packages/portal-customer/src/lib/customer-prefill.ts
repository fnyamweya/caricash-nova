export interface SendFlowPrefill {
    receiverMsisdn?: string;
    amount?: string;
    contactName?: string;
}

export interface PayFlowPrefill {
    storeCode?: string;
    merchantName?: string;
    amount?: string;
}

const SEND_PREFILL_KEY = 'caricash_customer_send_prefill_once';
const PAY_PREFILL_KEY = 'caricash_customer_pay_prefill_once';

function writePrefill<T>(key: string, value: T) {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore storage failures.
    }
}

function consumePrefill<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(key);
        if (!raw) return null;
        window.sessionStorage.removeItem(key);
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function setSendFlowPrefill(prefill: SendFlowPrefill) {
    writePrefill(SEND_PREFILL_KEY, prefill);
}

export function consumeSendFlowPrefill(): SendFlowPrefill | null {
    return consumePrefill<SendFlowPrefill>(SEND_PREFILL_KEY);
}

export function setPayFlowPrefill(prefill: PayFlowPrefill) {
    writePrefill(PAY_PREFILL_KEY, prefill);
}

export function consumePayFlowPrefill(): PayFlowPrefill | null {
    return consumePrefill<PayFlowPrefill>(PAY_PREFILL_KEY);
}
