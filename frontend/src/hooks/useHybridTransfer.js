import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

// Pull from environment configuration, defaulting to local testing port
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function useHybridTransfer(webRTCHook, jwtToken) {
  // Enum states: 'idle' | 'p2p_pending' | 'p2p_active' | 'cloud_active' | 'completed' | 'failed'
  const [transferMode, setTransferMode] = useState('idle');
  const [cloudProgress, setCloudProgress] = useState(0);
  
  const fallbackTimeoutRef = useRef(null);
  const pendingFileRef = useRef(null);

  // 3. Listen dynamically to the iceConnectionState of the RTCPeerConnection
  useEffect(() => {
    if (transferMode === 'p2p_pending') {
      if (webRTCHook.connectionState === 'connected') {
        // Race condition won! WebRTC successfully punched through the NAT.
        clearTimeout(fallbackTimeoutRef.current);
        setTransferMode('p2p_active');
        
        if (pendingFileRef.current) {
          console.log('[Hybrid Controller] NAT Traversal Success! P2P Mode engaged.');
          // Hand off to the chunking engine
          webRTCHook.sendFile(pendingFileRef.current);
          pendingFileRef.current = null;
        }
      }
    }
  }, [webRTCHook.connectionState, transferMode, webRTCHook]);

  const startTransfer = async (file) => {
    // 1. Initiate the WebRTC P2P connection sequence
    setTransferMode('p2p_pending');
    setCloudProgress(0);
    pendingFileRef.current = file;
    
    // Command the WebRTC Engine to begin the SDP Offer Sequence
    webRTCHook.connectAndOffer();
    
    // 2. Start a highly aggressive 5-second timeout race condition
    fallbackTimeoutRef.current = setTimeout(() => {
      
      // 4. Timeout reached: if WebRTC did not flip us to 'p2p_active', abort the WebRTC packet 
      if (pendingFileRef.current) {
        console.warn('[Hybrid Controller] WebRTC blocked by Firewall (5s Timeout). Pivoting heavily to S3 Cloud Relay.');
        
        const fallbackFile = pendingFileRef.current;
        pendingFileRef.current = null; // Clear the memory map so WebRTC aborts locally
        
        // 5. Instantly trigger the graceful S3 backend failure mode
        initiateCloudFallback(fallbackFile);
      }
    }, 5000);
  };

  const initiateCloudFallback = async (file) => {
    // 6. Provide instant UI state reflection that we shifted networking modes
    setTransferMode('cloud_active');
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // Safely dispatch multipart blob byte stream to the Python /upload endpoint
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${jwtToken}`
        },
        onUploadProgress: (progressEvent) => {
          // Native tracking of our cloud-bound bytes
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setCloudProgress(percentCompleted);
        }
      });
      
      console.log('[Cloud Relay] Upload Success! Acquired Pre-signed OS Link: ', response.data.url);
      
      // Next Step Architecture Note: Here you would emit the presigned URL over the Signaling WebSocket 
      // so the other peer automatically downloads it without being aware it failed P2P!
      
      setTransferMode('completed');
    } catch (err) {
      console.error('[Cloud Relay] Critical failure on S3 stream pipeline.', err);
      setTransferMode('failed');
    }
  };

  return {
    transferMode,
    cloudProgress,
    startTransfer
  };
}
