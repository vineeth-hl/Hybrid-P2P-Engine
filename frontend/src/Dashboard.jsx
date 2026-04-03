import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

// Hook integrations
import useSignaling from './hooks/useSignaling';
import useWebRTC from './hooks/useWebRTC';
import useHybridTransfer from './hooks/useHybridTransfer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function Dashboard() {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [sessionToken, setSessionToken] = useState(localStorage.getItem('token') || null);
  const [myName, setMyName] = useState(localStorage.getItem('anon_name') || '');
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  
  // The system requires a known WebRTC target UUID to initiate a handshake
  const [activeTarget, setActiveTarget] = useState(null);
  const fileInputRef = useRef(null);

  // 1. Initial Login Auth Sequence (Automatic Anonymous Identity Protocol)
  useEffect(() => {
    if (!sessionToken) {
      const randomId = Math.floor(Math.random() * 10000);
      const generatedName = 'Hacker_' + randomId;
      
      axios.post(`${API_URL}/auth/join`, { anonymous_name: generatedName })
        .then(res => {
           localStorage.setItem('token', res.data.access_token);
           localStorage.setItem('anon_name', generatedName);
           setSessionToken(res.data.access_token);
           setMyName(generatedName);
        })
        .catch(err => console.error("Identity generation failed. Ensure backend API is running.", err));
    }
  }, [sessionToken]);

  // 2. Live Presence Polling (Pulls from Python Redis Hook)
  useEffect(() => {
    if (!sessionToken) return;
    
    const fetchUsers = () => {
      axios.get(`${API_URL}/users/online`, { headers: { Authorization: `Bearer ${sessionToken}` } })
           .then(res => {
             // Filter ourselves out of the Lobby so we don't try to handshake ourselves
             const others = res.data.online_users.filter(u => u.name !== myName);
             setOnlineUsers(others);
           })
           .catch(console.error);
    };
    
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000); // 10 second refresh loops
    return () => clearInterval(interval);
  }, [sessionToken, myName]);

  // Core Hook Architecture Configuration
  const signaling = useSignaling(myName || 'Hacker', sessionToken);
  const webrtc = useWebRTC(signaling, activeTarget);
  const hybrid = useHybridTransfer(webrtc, sessionToken);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!activeTarget) {
       alert("Target Error: Please click an online user in the Lobby first to establish a tunneling target.");
       return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (!activeTarget) {
       alert("Target Error: Please click an online user in the Lobby first to establish a tunneling target.");
       return;
    }
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const openFileDialog = () => {
    if (!activeTarget) {
       alert("Target Error: Please click an online user in the Lobby first to establish a tunneling target.");
       return;
    }
    fileInputRef.current.click();
  };

  // Start the 5-Second Hybrid Race Sequence 
  const executeSendFlow = () => {
    if (!selectedFile) return;
    hybrid.startTransfer(selectedFile);
  };

  // Resolve visual percentage dynamically matching internal hardware streaming modes
  const activePercent = hybrid.transferMode === 'cloud_active' ? hybrid.cloudProgress : webrtc.progress;

  const modeBadges = {
    'idle': { text: 'Queued', color: 'text-amber-500' },
    'p2p_pending': { text: 'Negotiating P2P Firewall...', color: 'text-indigo-400' },
    'p2p_active': { text: 'P2P Direct', color: 'text-blue-400' },
    'cloud_active': { text: 'Cloud Server Relay', color: 'text-emerald-400' },
    'completed': { text: 'Delivered', color: 'text-green-500' },
    'failed': { text: 'Critical Pipeline Failure', color: 'text-red-500' }
  };
  const currentBadge = modeBadges[hybrid.transferMode] || modeBadges['idle'];

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-900 text-slate-200 p-6 font-sans">
      <header className="mb-8 text-center w-full max-w-6xl">
        <h1 className="text-4xl font-extrabold pb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Hybrid P2P-Cloud Transfer
        </h1>
        <p className="text-slate-400">Anonymous Serverless Matchmaking & Multi-Part Relay</p>
      </header>

      <main className="flex-1 w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* LEFT PANE - Lobby */}
        <section className="col-span-1 bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700 flex flex-col">
          <div className="bg-slate-800/80 p-4 border-b border-slate-700">
            <h2 className="text-xl font-bold flex items-center justify-between">
              <span>Lobby</span>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 py-1 px-2 rounded-full">
                {onlineUsers.length} Online
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-2 font-mono">You: <span className="text-blue-400 font-bold">{myName}</span></p>
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            {onlineUsers.length === 0 ? (
               <div className="text-center p-4 text-slate-500 text-sm">Searching for signals... Open an Incognito Window to test!</div>
            ) : null}
            <ul className="space-y-3">
              {onlineUsers.map(user => {
                const isActive = activeTarget === user.user_id;
                return (
                  <li 
                    key={user.user_id} 
                    onClick={() => setActiveTarget(user.user_id)}
                    className={`flex items-center space-x-3 p-3 rounded-xl transition cursor-pointer border ${isActive ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-slate-700/50 hover:bg-slate-700 border-transparent text-slate-300'}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold shadow-inner text-white">
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className={`text-sm font-semibold truncate transition ${isActive ? 'text-indigo-100' : 'text-slate-200'}`}>{user.name}</p>
                      <p className={`text-xs truncate transition ${isActive ? 'text-indigo-300' : 'text-slate-400 opacity-80'}`}>
                        {isActive ? 'Target Acquired' : 'Click to connect'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* RIGHT PANE - Active Transfers */}
        <section className="col-span-1 md:col-span-2 bg-slate-800 rounded-2xl shadow-xl border border-slate-700 flex flex-col p-6">
          <h2 className="text-2xl font-bold mb-6 text-slate-100 border-b border-slate-700 pb-2 flex justify-between items-center">
            <span>Active Transfers</span>
            {webrtc.connectionState === 'connected' && (
              <span className="text-xs bg-blue-500/20 text-blue-400 py-1 px-3 rounded-full animate-pulse border border-blue-500/30 filter drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]">
                P2P Link Secured
              </span>
            )}
          </h2>
          
          <div 
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer mb-8 h-48 ${
              activeTarget ? (isDragging ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-500 border-opacity-50 bg-slate-800/50 hover:bg-slate-700/30 hover:border-slate-400') : 'border-slate-700 bg-slate-800/20 opacity-50 cursor-not-allowed'
            }`}
            onDragOver={activeTarget ? handleDragOver : undefined}
            onDragLeave={activeTarget ? handleDragLeave : undefined}
            onDrop={activeTarget ? handleDrop : undefined}
            onClick={activeTarget ? openFileDialog : undefined}
          >
            <input 
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
            <div className={`mb-4 transition ${activeTarget ? (isDragging ? 'text-blue-400' : 'text-slate-400') : 'text-slate-600'}`}>
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className={`text-lg font-medium transition ${activeTarget ? (isDragging ? 'text-blue-300' : 'text-slate-300') : 'text-slate-500'}`}>
              {!activeTarget ? 'Select a target user from Lobby' : (isDragging ? 'Drop file to queue!' : 'Drag & Drop files to send')}
            </p>
            {activeTarget && <p className="text-sm text-slate-500 mt-2">or click to browse local storage</p>}
          </div>

          <div className="flex-1 space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Transfers Progress</h3>
            
            {selectedFile ? (
              <div className={`bg-slate-700/40 p-4 rounded-xl border relative transition-all ${hybrid.transferMode !== 'idle' ? 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-slate-600/50'}`}>
                
                {/* Only allow cancellation before transmission has actively acquired network bindings */}
                {hybrid.transferMode === 'idle' && (
                  <button 
                    className="absolute top-3 right-3 text-slate-400 hover:text-red-400 transition" 
                    onClick={() => setSelectedFile(null)}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}

                <div className="flex justify-between items-center mb-2 pr-8">
                  <span className="text-sm font-medium text-slate-200 truncate" title={selectedFile.name}>{selectedFile.name}</span>
                  
                  {hybrid.transferMode === 'idle' ? (
                     <button 
                       onClick={executeSendFlow} 
                       className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold py-1.5 px-6 rounded-full transition-all shadow-[0_4px_15px_rgba(79,70,229,0.4)] hover:shadow-[0_4px_20px_rgba(79,70,229,0.6)] hover:-translate-y-0.5 ml-4 absolute top-2 right-10"
                     >
                       SEND
                     </button>
                  ) : (
                     <span className={`text-xs font-bold ${currentBadge.color} text-opacity-90 whitespace-nowrap ml-4 text-right min-w-[30px]`}>
                       {activePercent}%
                     </span>
                  )}
                </div>
                
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800 relative shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ease-out flex items-center justify-end ${
                       hybrid.transferMode === 'cloud_active' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-indigo-500 to-blue-400'
                    }`} 
                    style={{ width: `${activePercent}%` }}
                  >
                    <div className="w-full h-full bg-white opacity-20 absolute top-0 left-0 bg-[length:10px_10px] bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)] animate-[progress_1s_linear_infinite]"></div>
                  </div>
                </div>
                
                <div className="flex justify-between mt-2 text-xs text-slate-400 align-middle">
                  <span>
                    {selectedFile.size > 1024 * 1024 
                      ? (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB' 
                      : (selectedFile.size / 1024).toFixed(1) + ' KB'}
                  </span>
                  <span className={`font-medium tracking-wide ${currentBadge.color} transition`}>{currentBadge.text}</span>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 border-2 border-dashed border-slate-600/30 rounded-xl text-slate-500 text-sm italic">
                No pipeline commands registered
              </div>
            )}
          </div>
        </section>
      </main>
      
      {/* Global Injection for striped animated progress bar CSS */}
      <style>{`
        @keyframes progress {
          0% { background-position: 0 0; }
          100% { background-position: 20px 0; }
        }
      `}</style>
    </div>
  );
}
