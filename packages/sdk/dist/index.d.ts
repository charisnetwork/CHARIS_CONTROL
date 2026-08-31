import * as axios from 'axios';
import { AxiosInstance } from 'axios';

declare class AuthModule {
    private client;
    constructor(client: CharisClient);
    /**
     * Logs a user in through the Control Center SSO.
     */
    login(email: string, password: string): Promise<any>;
    /**
     * Registers a new tenant and user.
     */
    register(tenantName: string, email: string, password: string, ownerName: string, mobileNo?: string): Promise<any>;
    /**
     * Verifies a JWT token with the Control Center.
     */
    verifyToken(token: string): Promise<any>;
}

declare class CharisRegistry {
    private client;
    constructor(client: AxiosInstance);
    register(): Promise<axios.AxiosResponse<any, any, {}>>;
    startHeartbeat(intervalMs?: number): void;
}

declare class CharisAI {
    private client;
    constructor(client: AxiosInstance);
    ask(prompt: string, context?: any): Promise<axios.AxiosResponse<any, any, {}>>;
}

declare class CharisLogger {
    private client;
    constructor(client: AxiosInstance);
    info(message: string, meta?: any): void;
    error(message: string, error?: any): void;
    private shipLog;
}

declare class CharisFeatureFlags {
    private client;
    private flags;
    constructor(client: AxiosInstance);
    fetchFlags(): Promise<void>;
    isEnabled(flagName: string): boolean;
}

declare class CharisNotifications {
    private client;
    constructor(client: AxiosInstance);
    send(userId: string, template: string, payload: any): Promise<axios.AxiosResponse<any, any, {}>>;
}

declare class CharisMonitoring {
    attachExpress(app: any): void;
}

interface CharisSDKConfig {
    productId: string;
    apiKey: string;
    environment?: string;
    gatewayUrl?: string;
}
declare class CharisClient {
    auth: AuthModule;
    registry: CharisRegistry;
    ai: CharisAI;
    logger: CharisLogger;
    featureFlags: CharisFeatureFlags;
    notifications: CharisNotifications;
    monitoring: CharisMonitoring;
    http: AxiosInstance;
    productId: string;
    private initialized;
    init(config: CharisSDKConfig): void;
}
declare const CharisSDK: CharisClient;

export { CharisClient, CharisSDK, type CharisSDKConfig };
