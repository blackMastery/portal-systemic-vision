
import { encrypt, toBase64Url } from "@/lib/encryption";

interface MMGConfig {
  apiKey: string;
  apiUrl: string;
}

interface CreateCheckoutSessionParams {
  amount: number;
  currency: string;
  description?: string;
  app_transaction_id: number;
}

export class MMGService {
  private config: MMGConfig;

  constructor(config: MMGConfig) {
    this.config = config;
  }

  encryptAndGenerateUrl(token: Buffer, msisdn: string, clientId: string): string {
    console.log("🚀 ~ encryptAndGenerateUrl ~ clientId:", clientId);
    console.log("🚀 ~ encryptAndGenerateUrl ~ msisdn:", msisdn);
    console.log("🚀 ~ encryptAndGenerateUrl ~ token:", token);
    // Assuming you have your encryption logic here
    // const encryptedData = encrypt(token); // Your encryption function

    // Convert to base64url
    const encodedToken = toBase64Url(token)
    // .toString("base64")
    // .replace(/\+/g, "-")
    // .replace(/\//g, "_")
    // .replace(/=+$/, "");
    console.log("🚀 ~ MMGService ~ encryptAndGenerateUrl ~ encodedToken:", encodedToken)
    
    // Use new MMG checkout URL format (UAT: https://mmgpg.mmgtest.net/mmg-pg/web/payments)
    const checkoutBaseUrl = process.env.MMG_CHECKOUT_URL;
    console.log("🚀 ~ MMGService ~ encryptAndGenerateUrl ~ checkoutBaseUrl:", checkoutBaseUrl)

    return `${checkoutBaseUrl}?token=${encodedToken}&merchantId=${msisdn}&X-Client-ID=${clientId}`;
  }

  async createCheckoutSession(params: CreateCheckoutSessionParams) {
    const { amount, currency, description, app_transaction_id } = params;
    const MMG_MERCHANT_MID = process.env.MMG_MERCHANT_MID;
    if (!MMG_MERCHANT_MID) {
      throw new Error("MMG_MERCHANT_MID environment variable is required");
    }
    console.log("🚀 ~ MMGService ~ createCheckoutSession ~ MMG_MERCHANT_MID:", MMG_MERCHANT_MID)
    // const timestamp = new Date().toISOString();
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
    console.log("🚀 ~ createCheckoutSession ~ tokenParams:", tokenParams);
    const encrypted = encrypt(tokenParams);
    const MMG_CLIENT_ID = process.env.MMG_CLIENT_ID;
    if (!MMG_CLIENT_ID) {
      throw new Error("MMG_CLIENT_ID environment variable is required");
    }
    const url = this.encryptAndGenerateUrl(
      encrypted,
      MMG_MERCHANT_MID,
      MMG_CLIENT_ID
    );
    console.log("🚀 ~ createCheckoutSession ~ url:", url);
    return url;
  }
}

// Create a singleton instance
export const mmgService = new MMGService({
  apiKey: process.env.MMG_API_KEY || "",
  apiUrl: process.env.MMG_API_URL || "https://uat-api.mmg.gy/merchant",
});
