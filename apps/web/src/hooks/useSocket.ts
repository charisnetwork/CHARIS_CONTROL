import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const apiBaseUrl = import.meta.env.VITE_CONTROL_API_URL?.trim().replace(/\/+$/, '');

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!apiBaseUrl) {
      setSocket(null);
      return;
    }

    const socketInstance = io(apiBaseUrl);
    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [apiBaseUrl]);

  return socket;
}
