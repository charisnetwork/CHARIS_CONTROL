import axios from 'axios';
import { AppError } from '../middlewares/error.middleware';

/**
 * Make a secure request to an external application
 */
export const externalAppRequest = async (
  apiBaseUrl: string,
  apiKey: string,
  endpoint: string
) => {
  try {
    const response = await axios.get(`${apiBaseUrl}${endpoint}`, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout to prevent hanging
    });
    
    return response.data;
  } catch (error: any) {
    console.error(`External request failed: ${apiBaseUrl}${endpoint}`, error.message);
    
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
