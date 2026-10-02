import axios, { AxiosInstance } from 'axios';

export const createHttpClient = (gatewayUrl: string, apiKey: string, applicationId: string): AxiosInstance => {
  const client = axios.create({
    baseURL: gatewayUrl,
    headers: {
      'Content-Type': 'application/json',
      'X-Charis-App-Key': apiKey,
      'X-Charis-Application-Id': applicationId,
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
