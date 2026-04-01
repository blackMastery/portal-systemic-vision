import { encrypt, toBase64Url } from "@/lib/encryption";

interface MMGConfig {
  apiKey: string;
  apiUrl: string;
}

interface CreateCheckoutSessionParams {
  amount: number;
  currency: string;
  description?: string;
  app_transaction_id: string;
}

/** MMG e-commerce login response */
export interface MMGEcommerceLoginResponse {
  token_type: string;
  refresh_token: string | null;
  expires_in: number;
  access_token: string;
  scope?: string;
}

/** MMG transaction lookup response (e-merchant-initiated-transactions/lookup) */
export interface MMGLookupMetadataItem {
  key: string;
  value: string;
}

export interface MMGLookupResult {
  amount: string;
  currency: string;
  subType?: string;
  descriptionText: string | null;
  requestDate: string;
  debitParty: Array<{ key: string; value: string }>;
  creditParty: Array<{ key: string; value: string }>;
  metadata: MMGLookupMetadataItem[];
  transactionStatus: string;
  creationDate: string;
  transactionReference: string;
  transactionReceipt: string;
  executionId: string;
}

/** In-memory cache for e-commerce token (server-side only) */
let ecommerceTokenCache: { accessToken: string; expiresAt: number } | null = null;

export class MMGService {
  private config: MMGConfig;

  constructor(config: MMGConfig) {
    this.config = config;
  }

  /**
   * E-commerce login: obtain access_token for server-to-server MMG e-commerce API.
   * Uses MMG_ECOMMERCE_* env vars. Token is cached until expiry.
   */
  async getEcommerceToken(): Promise<string> {
    const now = Date.now();
    const bufferSeconds = 30;
    if (
      ecommerceTokenCache &&
      ecommerceTokenCache.expiresAt > now + bufferSeconds * 1000
    ) {
      return ecommerceTokenCache.accessToken;
    }

    const baseUrl =
      process.env.MMG_ECOMMERCE_URL || "https://mwallet.mmgtest.net";
    const apiKey = process.env.MMG_ECOMMERCE_API_KEY;
    const username = process.env.MMG_ECOMMERCE_USERNAME;
    const password = process.env.MMG_ECOMMERCE_PASSWORD;

    if (!apiKey || !username || !password) {
      throw new Error(
        "MMG_ECOMMERCE_API_KEY, MMG_ECOMMERCE_USERNAME, and MMG_ECOMMERCE_PASSWORD are required"
      );
    }

    const url = `${baseUrl}/olive/publisher/v1/e-commerce-login/mer`;
    const body = new URLSearchParams({
      grant_type: "password",
      api_key: apiKey,
      username,
      password,
    }).toString();

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MMG e-commerce login failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as MMGEcommerceLoginResponse;
    const expiresInMs = (data.expires_in ?? 120) * 1000;
    ecommerceTokenCache = {
      accessToken: data.access_token,
      expiresAt: now + expiresInMs,
    };
    return data.access_token;
  }

  /**
   * Look up a transaction by MMG transaction ID using e-commerce API.
   * Calls getEcommerceToken() then GET lookup. Throws if lookup fails or transaction not successful.
   */
  async lookupTransaction(transactionId: string): Promise<MMGLookupResult> {
    const token = await this.getEcommerceToken();
    const baseUrl =
      process.env.MMG_ECOMMERCE_URL || "https://mwallet.mmgtest.net";
    const url = `${baseUrl}/olive/publisher/v1/e-merchant-initiated-transactions/lookup?transactionId=${encodeURIComponent(transactionId)}`;

    const mid = process.env.MMG_WSS_MID;
    const mkey = process.env.MMG_WSS_MKEY;
    const msecret = process.env.MMG_WSS_MSECRET;
    const apiKey = process.env.MMG_ECOMMERCE_API_KEY;

    if (!mid || !mkey || !msecret || !apiKey) {
      throw new Error(
        "MMG_WSS_MID, MMG_WSS_MKEY, MMG_WSS_MSECRET, and MMG_ECOMMERCE_API_KEY are required for transaction lookup"
      );
    }

    const correlationId = crypto.randomUUID();
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-wss-mid": mid,
        "x-wss-mkey": mkey,
        "x-wss-msecret": msecret,
        "x-api-key": apiKey,
        "x-wss-correlationid": correlationId,
        "x-wss-token": token,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `MMG transaction lookup failed: ${res.status} ${text}`
      );
    }

    const data = (await res.json()) as MMGLookupResult;
    if (data.transactionStatus?.toLowerCase() !== "successful") {
      throw new Error(
        `Transaction not successful: status=${data.transactionStatus}`
      );
    }
    return data;
  }

  encryptAndGenerateUrl(token: Buffer, msisdn: string, clientId: string): string {
    const encodedToken = toBase64Url(token);
    const checkoutBaseUrl = process.env.MMG_CHECKOUT_URL;
    return `${checkoutBaseUrl}?token=${encodedToken}&merchantId=${msisdn}&X-Client-ID=${clientId}`;
  }

  async createCheckoutSession(params: CreateCheckoutSessionParams) {
    const { amount, currency, description, app_transaction_id } = params;
    const MMG_MERCHANT_MID = process.env.MMG_MERCHANT_MID;
    if (!MMG_MERCHANT_MID) {
      throw new Error("MMG_MERCHANT_MID environment variable is required");
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const tokenParams = {
      secretKey: process.env.MMG_SECRET_KEY,
      amount: amount,
      merchantId: MMG_MERCHANT_MID,
      merchantTransactionId: app_transaction_id,
      productDescription: description,
      requestInitiationTime: timestamp,
      merchantName: `Ecommerce merchant ${MMG_MERCHANT_MID}`,
    };
    const encrypted = encrypt(tokenParams);
    const MMG_CLIENT_ID = process.env.MMG_CLIENT_ID;
    if (!MMG_CLIENT_ID) {
      throw new Error("MMG_CLIENT_ID environment variable is required");
    }
    return this.encryptAndGenerateUrl(encrypted, MMG_MERCHANT_MID, MMG_CLIENT_ID);
  }
}

// Create a singleton instance
export const mmgService = new MMGService({
  apiKey: process.env.MMG_API_KEY || "",
  apiUrl: process.env.MMG_API_URL || "https://uat-api.mmg.gy/merchant",
});
