import axios from 'axios';
import { AppError } from '../middlewares/error.middleware';
import { assertSafePublicUrl } from './urlSafety.service';

/**
 * Make a secure request to an external application
 */
export const externalAppRequest = async (
  apiBaseUrl: string,
  apiKey: string,
  endpoint: string
) => {
  try {
    const base = await assertSafePublicUrl(apiBaseUrl, 'Application API URL');
    const target = new URL(endpoint, base).toString();
    const response = await axios.get(target, {
      headers: {
        'x-api-key': apiKey,
        // Product adapters use this explicit header. It carries the registered
        // application credential over TLS and is never returned to browsers.
        'x-control-center-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout to prevent hanging
    });
    
    return response.data;
  } catch (error: any) {
    console.error(`External application request failed: ${error.message}`);
    
    // Pass standard axios errors to our custom AppError
    if (error.response) {
      throw new AppError(`External app error: ${error.response.statusText}`, error.response.status);
    } else if (error.request) {
      throw new AppError('External app is unreachable (Connection Timeout or Refused)', 502);
    } else {
      throw new AppError('Internal Integration Error', 500);
    }
  }
};
