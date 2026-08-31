import { AxiosInstance } from 'axios';

export class CharisNotifications {
  private client: AxiosInstance;

  constructor(client: AxiosInstance) {
    this.client = client;
  }

  async send(userId: string, template: string, payload: any) {
    return this.client.post('/notifications/send', { userId, template, payload });
  }
}
