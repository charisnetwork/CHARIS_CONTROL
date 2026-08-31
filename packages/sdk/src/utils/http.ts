import axios, { AxiosInstance } from 'axios';

export const createHttpClient = (gatewayUrl: string, apiKey: string, productId: string): AxiosInstance => {
  const client = axios.create({
    baseURL: gatewayUrl,
    headers: {
      'Content-Type': 'application/json',
      'X-Charis-API-Key': apiKey,
      'X-Charis-Product-Id': productId,
    },
  });

  // Example interceptor
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      // Global error handling could be dispatched here
      return Promise.reject(error);
    }
  );

  return client;
};
