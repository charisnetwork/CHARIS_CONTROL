import { CharisClient } from '../index';

export class AuthModule {
  private client: CharisClient;

  constructor(client: CharisClient) {
    this.client = client;
  }

  /**
   * Logs a user in through the Control Center SSO.
   */
  async login(email: string, password: string): Promise<any> {
    const response = await this.client.http.post('/sso/login', {
      email,
      password,
      productId: this.client.productId
    });
    return response.data;
  }

  /**
   * Registers a new tenant and user.
   */
  async register(tenantName: string, email: string, password: string, ownerName: string, mobileNo?: string): Promise<any> {
    const response = await this.client.http.post('/sso/register', {
      tenantName,
      email,
      password,
      ownerName,
      mobileNo,
      productId: this.client.productId
    });
    return response.data;
  }

  /**
   * Verifies a JWT token with the Control Center.
   */
  async verifyToken(token: string): Promise<any> {
    const response = await this.client.http.post(
      '/sso/verify',
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  }
}
