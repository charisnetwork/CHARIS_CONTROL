import { AxiosInstance } from 'axios';

export class CharisAI {
  private client: AxiosInstance;

  constructor(client: AxiosInstance) {
    this.client = client;
  }

  async ask(prompt: string, context?: any) {
    // Stub for routing AI questions to the AI microservice via the Gateway
    return this.client.post('/ai/completions', { prompt, context });
  }
}
