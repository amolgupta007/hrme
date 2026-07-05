import { decrypt } from "@/lib/crypto/aes-gcm";

const BASE_URL = "https://api.razorpay.com/v1";

// ---- Types ----

export type RazorpayXCredentials = {
  key_id: string;
  key_secret_encrypted: string;
  account_id: string;
  account_number: string;
};

export type RazorpayXClient = {
  /** Underlying fetch with auth header injected. */
  request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<RazorpayXResult<T>>;
};

export type RazorpayXResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: RazorpayXError; status: number };

export type RazorpayXError = {
  code: string;
  description: string;
  field?: string;
  source?: string;
  step?: string;
  reason?: string;
  raw?: unknown;
};

// ---- Contact + Fund Account ----

export type ContactInput = {
  name: string;
  email?: string;
  contact?: string;
  type?: "employee" | "vendor" | "customer" | "self";
  reference_id?: string;
  notes?: Record<string, string>;
};

export type ContactResponse = {
  id: string;
  entity: "contact";
  name: string;
  type: string | null;
  reference_id: string | null;
  email: string | null;
  contact: string | null;
  created_at: number;
};

export type FundAccountInput = {
  contact_id: string;
  account_type: "bank_account" | "vpa";
  bank_account?: {
    name: string;
    ifsc: string;
    account_number: string;
  };
  vpa?: { address: string };
};

export type FundAccountResponse = {
  id: string;
  entity: "fund_account";
  contact_id: string;
  account_type: string;
  bank_account?: {
    ifsc: string;
    bank_name: string;
    name: string;
    account_number: string; // RazorpayX returns this masked
  };
  active: boolean;
  created_at: number;
};

// ---- Penny-drop ----

export type FundAccountValidationInput = {
  fund_account: { id: string };
  amount: number; // typically 100 (paise, i.e. ₹1)
  currency: "INR";
  notes?: Record<string, string>;
};

export type FundAccountValidationResponse = {
  id: string;
  entity: "fund_account.validation";
  fund_account_id: string;
  status: "created" | "completed" | "failed";
  amount: number;
  currency: "INR";
  notes: Record<string, string> | null;
  results?: {
    account_status?: "active" | "invalid" | string;
    registered_name?: string;
  };
  created_at: number;
};

// ---- Payout ----

export type PayoutInput = {
  account_number: string; // RazorpayX virtual account number (from credentials)
  fund_account_id: string;
  amount: number; // paise
  currency: "INR";
  mode: "IMPS" | "NEFT" | "RTGS" | "UPI";
  purpose: "salary" | "refund" | "cashback" | "payout" | string;
  queue_if_low_balance?: boolean;
  reference_id?: string;
  narration?: string;
  notes?: Record<string, string>;
};

export type PayoutResponse = {
  id: string;
  entity: "payout";
  fund_account_id: string;
  amount: number;
  currency: "INR";
  status:
    | "queued"
    | "pending"
    | "rejected"
    | "processing"
    | "processed"
    | "cancelled"
    | "reversed"
    | "failed";
  mode: string;
  reference_id: string | null;
  utr: string | null;
  fees: number;
  tax: number;
  failure_reason: string | null;
  created_at: number;
};

// ---- Client factory ----

/**
 * Build a typed HTTP client for the RazorpayX REST API. Decrypts the stored
 * key_secret at call time; do NOT cache the returned client across requests
 * (the decryption is cheap and avoids leaking plaintext between contexts).
 */
export function createRazorpayXClient(creds: RazorpayXCredentials): RazorpayXClient {
  const keySecret = decrypt(creds.key_secret_encrypted);
  const authHeader =
    "Basic " + Buffer.from(`${creds.key_id}:${keySecret}`).toString("base64");

  async function request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<RazorpayXResult<T>> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(extraHeaders ?? {}),
    };
    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Disable Next.js fetch caching for all RazorpayX calls; they're never cacheable.
      cache: "no-store",
    };
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        error: {
          code: "network_error",
          description: e?.message ?? "Network error reaching RazorpayX",
        },
      };
    }
    let parsed: any = null;
    try {
      parsed = await response.json();
    } catch {
      // Non-JSON response
    }
    if (!response.ok) {
      const err = parsed?.error ?? {};
      return {
        ok: false,
        status: response.status,
        error: {
          code: err.code ?? `http_${response.status}`,
          description: err.description ?? response.statusText ?? "Unknown error",
          field: err.field,
          source: err.source,
          step: err.step,
          reason: err.reason,
          raw: parsed,
        },
      };
    }
    return { ok: true, status: response.status, data: parsed as T };
  }

  return { request };
}

// ---- High-level helpers ----

export async function pingConnection(
  client: RazorpayXClient,
): Promise<RazorpayXResult<{ count: number }>> {
  return client.request<{ count: number }>("GET", "/contacts?count=1");
}

export async function createContact(
  client: RazorpayXClient,
  input: ContactInput,
): Promise<RazorpayXResult<ContactResponse>> {
  return client.request<ContactResponse>("POST", "/contacts", input);
}

export async function createFundAccount(
  client: RazorpayXClient,
  input: FundAccountInput,
): Promise<RazorpayXResult<FundAccountResponse>> {
  return client.request<FundAccountResponse>("POST", "/fund_accounts", input);
}

export async function verifyFundAccount(
  client: RazorpayXClient,
  input: FundAccountValidationInput,
): Promise<RazorpayXResult<FundAccountValidationResponse>> {
  return client.request<FundAccountValidationResponse>(
    "POST",
    "/fund_accounts/validations",
    input,
  );
}

export async function createPayout(
  client: RazorpayXClient,
  input: PayoutInput,
  idempotencyKey: string,
): Promise<RazorpayXResult<PayoutResponse>> {
  return client.request<PayoutResponse>("POST", "/payouts", input, {
    "X-Payout-Idempotency": idempotencyKey,
  });
}

export async function getPayout(
  client: RazorpayXClient,
  payoutId: string,
): Promise<RazorpayXResult<PayoutResponse>> {
  return client.request<PayoutResponse>("GET", `/payouts/${payoutId}`);
}

/**
 * Bulk payout: RazorpayX's batch endpoint has evolved over time. As of mid-2026
 * the canonical path is `/payouts_batches` — VERIFY against current RazorpayX
 * docs at integration testing time. If the endpoint differs, only this function
 * needs updating; all callers consume `BulkPayoutResponse` which matches the
 * payout entity shape returned in the items array.
 *
 * Items share `account_number` (org's RazorpayX virtual account).
 */
export type BulkPayoutInput = {
  account_number: string;
  items: Array<Omit<PayoutInput, "account_number">>;
};

export type BulkPayoutResponse = {
  id?: string; // batch_id when batch API returns one
  items: PayoutResponse[];
};

export async function createBulkPayout(
  client: RazorpayXClient,
  input: BulkPayoutInput,
  idempotencyKey: string,
): Promise<RazorpayXResult<BulkPayoutResponse>> {
  // TODO(integration): confirm exact endpoint path + payload shape against
  // current RazorpayX docs when running first integration test in sandbox.
  // Fallback strategy: if /payouts_batches errors with 404 / unsupported,
  // fall back to looping createPayout per item with a per-item idempotency key
  // derived from idempotencyKey + index.
  return client.request<BulkPayoutResponse>("POST", "/payouts_batches", input, {
    "X-Payout-Idempotency": idempotencyKey,
  });
}
