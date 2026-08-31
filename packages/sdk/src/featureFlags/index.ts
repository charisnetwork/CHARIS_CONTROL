import { AxiosInstance } from 'axios';

export class CharisFeatureFlags {
  private client: AxiosInstance;
  private flags: Record<string, boolean> = {};

  constructor(client: AxiosInstance) {
    this.client = client;
  }

  async fetchFlags() {
    try {
      const response = await this.client.get('/flags');
      this.flags = response.data.flags || {};
    } catch (e) {
      console.warn('[CharisSDK] Failed to fetch feature flags');
    }
  }

  isEnabled(flagName: string): boolean {
    return !!this.flags[flagName];
  }
}
