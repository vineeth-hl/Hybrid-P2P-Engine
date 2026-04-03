import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

// Defaults for local testing. In production, these pull from Vite env variables (.env)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';

export default function useSignaling(anonymousName, jwtToken) {
  const socketRef = useRef(null);

  useEffect(() => {
    // Strict guard: Do not establish connections if identity is not yet acquired
    if (!anonymousName || !jwtToken) return;

    // ----------------------------------------------------
    // 1. SIGNALING: Connect to Node.js Matchmaker WebSockets
    // ----------------------------------------------------
    const socket = io(SIGNALING_URL, {
      transports: ['websocket'],
      reconnection: true
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[Signaling] Linked active connection ID: ${socket.id}`);
      
      // We parse the UUID out of our JWT token structure without needing a backend trip
      try {
        const base64Url = jwtToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));
        
        // Immediately register our UUID to our active socket ID in the server's Memory Map
        socket.emit('register', { uuid: payload.sub });
      } catch (err) {
        console.error("Failed to parse JWT payload for socket registration", err);
      }
    });

    socket.on('disconnect', () => {
      console.warn('[Signaling] Connection severed');
    });

    // ----------------------------------------------------
    // 2. DISCOVERY: Send heartbeat to Python FastAPI/Redis
    // ----------------------------------------------------
    const sendHeartbeat = async () => {
      try {
        await axios.post(`${API_URL}/heartbeat`, {}, {
          headers: { Authorization: `Bearer ${jwtToken}` }
        });
      } catch (error) {
        console.error(`[API Heartbeat] Failed to ping FastAPI`, error);
      }
    };

    // Trigger instant heartbeat so the user immediately populates on the Lobby Dashboard
    sendHeartbeat();
    
    // Set strict 30 second polling to keep our Redis TTL (60s) from expiring
    const intervalId = setInterval(sendHeartbeat, 30 * 1000);

    // ----------------------------------------------------
    // 3. CLEANUP: Avoid overlapping loops and memory leaks
    // ----------------------------------------------------
    return () => {
      clearInterval(intervalId);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [anonymousName, jwtToken]);

  // Expose relayed transmission events
  // We use useCallback so these functions retain memory identity across re-renders
  const sendOffer = useCallback((targetUuid, sdp) => {
    socketRef.current?.emit('offer', { targetUuid, sdp });
  }, []);

  const sendAnswer = useCallback((targetUuid, sdp) => {
    socketRef.current?.emit('answer', { targetUuid, sdp });
  }, []);

  const sendIceCandidate = useCallback((targetUuid, candidate) => {
    socketRef.current?.emit('ice-candidate', { targetUuid, candidate });
  }, []);

  return {
    socket: socketRef.current,
    sendOffer,
    sendAnswer,
    sendIceCandidate
  };
}
