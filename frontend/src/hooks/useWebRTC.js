import { useState, useRef, useCallback, useEffect } from 'react';

const CHUNK_SIZE = 16384; // Exactly 16KB chunking size
const DB_NAME = 'TransferCache';
const STORE_NAME = 'chunks';

// ----------------------------------------------------
// Native IndexedDB Promisified Wrappers (The HDD Layer)
// ----------------------------------------------------
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const storeChunk = async (chunk) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add(chunk);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
};

const getAllChunks = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
};

const clearStore = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
};


export default function useWebRTC(signalingHook, targetUuid) {
  const [progress, setProgress] = useState(0);
  const [connectionState, setConnectionState] = useState('disconnected');
  
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  
  const receivedSizeRef = useRef(0);
  const expectedSizeRef = useRef(0);
  const fileMetaRef = useRef({ name: '', type: '' });

  const initWebRTC = useCallback((destinationOverride = null) => {
    const peerDestination = destinationOverride || targetUuid;
    const rtcConfig = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    pc.oniceconnectionstatechange = () => {
      // CRITICAL: Do not aggressively set 'connected' just because ICE found a path! 
      // The DataChannel must physically open first to avoid sendFile() crashing.
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setConnectionState(pc.iceConnectionState);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && peerDestination) {
        signalingHook.sendIceCandidate(peerDestination, event.candidate);
      }
    };

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    return pc;
  }, [signalingHook, targetUuid]);

  const setupDataChannel = (channel) => {
    dataChannelRef.current = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('WebRTC DataChannel connection established!');
      setConnectionState('connected');
    };

    channel.onclose = () => {
      console.log('WebRTC DataChannel closed.');
      setConnectionState('disconnected');
    };

    // 1. DataChannel incoming event handler heavily modified for HDD bypass
    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const meta = JSON.parse(event.data);
          if (meta.type === 'file-meta') {
            expectedSizeRef.current = meta.size;
            fileMetaRef.current = { name: meta.name, type: meta.fileType };
            
            // Wipe local HDD cache instantly in case previous crashed transfers left orphans
            await clearStore();
            receivedSizeRef.current = 0;
            setProgress(0);
          }
        } catch (e) {
          console.error("Failed parsing DataChannel metadata", e);
        }
      } else {
        const chunk = event.data;
        
        // 2. Push 16KB chunk bypassing OS RAM instantly to persistent local SSD/HDD store
        await storeChunk(chunk);
        receivedSizeRef.current += chunk.byteLength;

        let percentage = Math.round((receivedSizeRef.current / expectedSizeRef.current) * 100);
        setProgress(percentage);

        // 3. Complete EOF Event trigger mapped
        if (receivedSizeRef.current >= expectedSizeRef.current) {
          console.log('[WebRTC] File sequence finished. Reading offline DB tree...');
          
          const chunks = await getAllChunks();
          
          // Construct the monolithic Blob completely disconnected from active memory transfer
          const blob = new Blob(chunks, { type: fileMetaRef.current.type });
          
          const windowUrl = URL.createObjectURL(blob);
          const downloadAnchor = document.createElement('a');
          downloadAnchor.href = windowUrl;
          downloadAnchor.download = fileMetaRef.current.name || 'received_file';
          downloadAnchor.click();
          
          URL.revokeObjectURL(windowUrl); 
          
          // 4. Force immediate wipe of the hard drive blocks
          await clearStore();
          receivedSizeRef.current = 0;
        }
      }
    };
  };

  // ============================================
  // CRITICAL FIX: Bind incoming Signaling Events to WebRTC Handshakes
  // Without this, the receiver completely ignores the sender's packets!
  // ============================================
  useEffect(() => {
    const socket = signalingHook.socket;
    if (!socket) return;

    const onOffer = async (data) => {
      console.log('[WebRTC] Received explicit SDP Offer from:', data.senderUuid);
      // We must override the React closure target to ensure the Answer is routed back to the exact sender!
      const pc = initWebRTC(data.senderUuid);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalingHook.sendAnswer(data.senderUuid, pc.localDescription);
      } catch (err) {
        console.error('[WebRTC] Failed to negotiate incoming handshake:', err);
      }
    };

    const onAnswer = async (data) => {
      console.log('[WebRTC] Received explicit SDP Answer from:', data.senderUuid);
      if (peerConnectionRef.current) {
        try {
           await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (err) {
           console.error('[WebRTC] SDP Answer routing failed:', err);
        }
      }
    };

    const onIceCandidate = async (data) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('[WebRTC] DataChannel ICE matching failure', e);
        }
      }
    };

    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('ice-candidate', onIceCandidate);

    return () => {
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice-candidate', onIceCandidate);
    };
  }, [signalingHook.socket, initWebRTC, signalingHook]);

  const connectAndOffer = async () => {
    const pc = initWebRTC(null);
    
    const channel = pc.createDataChannel('fileTransferChannel');
    setupDataChannel(channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    if (targetUuid) {
      signalingHook.sendOffer(targetUuid, pc.localDescription);
    }
  };

  const sendFile = (file) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      console.error('DataChannel is not open, fallback required');
      return;
    }

    channel.send(JSON.stringify({
      type: 'file-meta',
      name: file.name,
      size: file.size,
      fileType: file.type
    }));

    setProgress(0);

    const reader = new FileReader();
    let offset = 0;

    const readNext16KBChunk = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (channel.readyState !== 'open') return;
      
      const chunk = e.target.result;
      
      if (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
        channel.onbufferedamountlow = () => {
          channel.onbufferedamountlow = null;
          channel.send(chunk);
          tickProgress();
        };
      } else {
         channel.send(chunk);
         tickProgress();
      }
    };
    
    const tickProgress = () => {
      offset += CHUNK_SIZE;
      const percentage = Math.min(100, Math.round((offset / file.size) * 100));
      setProgress(percentage);
      
      if (offset < file.size) {
        setTimeout(readNext16KBChunk, 0);
      } else {
        console.log('[WebRTC] Dispatch complete.');
      }
    };

    channel.bufferedAmountLowThreshold = CHUNK_SIZE * 4; 
    readNext16KBChunk();
  };

  return {
    progress,
    connectionState,
    connectAndOffer,
    sendFile
  };
}
