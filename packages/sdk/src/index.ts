import { createHttpClient } from './utils/http';
import { AuthModule } from './auth';
import { AxiosInstance } from 'axios';
import { CharisRegistry } from './registry';
import { CharisAI } from './ai';
import { CharisLogger } from './logger';
import { CharisFeatureFlags } from './featureFlags';
import { CharisNotifications } from './notifications';
import { CharisMonitoring } from './monitoring';
import { EntitlementManager } from './entitlements';

export * from './entitlements';

export interface CharisSDKConfig {
  productId: string;
  apiKey: string;
  environment?: string;
  gatewayUrl?: string;
  /** Immutable Control Centre Application UUID. */
  applicationId?: string;
  publicKey?: string;
  webhookSecret?: string;
}

export class CharisClient {
  public auth!: AuthModule;
  public registry!: CharisRegistry;
  public ai!: CharisAI;
  public logger!: CharisLogger;
  public featureFlags!: CharisFeatureFlags;
  public notifications!: CharisNotifications;
  public monitoring!: CharisMonitoring;
  public entitlements!: EntitlementManager;
  public http!: AxiosInstance;
  public productId!: string;

  private initialized = false;

  init(config: CharisSDKConfig) {
    if (this.initialized) {
      console.warn('[CharisSDK] Already initialized');
      return;
    }

    const gatewayUrl = config.gatewayUrl || 'https://api.charisnetwork.com';
    const client = createHttpClient(gatewayUrl, config.apiKey, config.productId);
    this.http = client;
    this.productId = config.productId;

    this.auth = new AuthModule(this);
    this.registry = new CharisRegistry(client);
    this.ai = new CharisAI(client);
    this.logger = new CharisLogger(client);
    this.featureFlags = new CharisFeatureFlags(client);
    this.notifications = new CharisNotifications(client);
    this.monitoring = new CharisMonitoring();
    
    if (config.publicKey && config.webhookSecret && config.applicationId) {
      this.entitlements = new EntitlementManager(config.applicationId, config.publicKey, config.webhookSecret, client);
    }

    this.initialized = true;

    // Automatically trigger background setup
    this.registry.register().catch(() => {});
    this.registry.startHeartbeat();
    this.featureFlags.fetchFlags();

    console.log(`[CharisSDK] Initialized for product: ${config.productId}`);
  }
}

// Export singleton
export const CharisSDK = new CharisClient();
