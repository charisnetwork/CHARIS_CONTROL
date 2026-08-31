import { AxiosInstance } from 'axios';

export class CharisLogger {
  private client: AxiosInstance;

  constructor(client: AxiosInstance) {
    this.client = client;
  }

  info(message: string, meta?: any) {
    console.log(`[INFO] ${message}`, meta || '');
    this.shipLog('info', message, meta);
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error || '');
    this.shipLog('error', message, error);
  }

  private shipLog(level: string, message: string, meta?: any) {
    // Fire and forget log shipping
    this.client.post('/audit/ingest', { level, message, meta, timestamp: new Date().toISOString() }).catch(() => {});
  }
}
