import { AxiosInstance } from 'axios';

export class CharisRegistry {
  private client: AxiosInstance;

  constructor(client: AxiosInstance) {
    this.client = client;
  }

  async register() {
    // Stub for registering product with Control Center
    console.log('[CharisSDK] Registering product with Control Center...');
    return this.client.post('/registry/register');
  }

  startHeartbeat(intervalMs: number = 30000) {
    setInterval(() => {
      this.client.post('/registry/heartbeat').catch(() => {
        // Silently fail heartbeat for now
      });
    }, intervalMs);
  }
}
