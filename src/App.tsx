import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Settings, MessageSquare, PenTool, Image as ImageIcon, Send, Loader2, CheckCircle2 } from 'lucide-react';
import Chatbot from './components/Chatbot';
import ConfigPanel from './components/ConfigPanel';
import PostGenerator from './components/PostGenerator';

export default function App() {
  const [activeTab, setActiveTab] = useState<'generate' | 'config' | 'chat'>('generate');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    checkAuthStatus();
    fetchConfig();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuthStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.sources) {
        setSources(data.sources);
      }
    } catch (e) {
      console.error('Failed to fetch config', e);
    }
  };

  const handleSetSources = async (newSources: string[]) => {
    setSources(newSources);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: newSources })
      });
    } catch (e) {
      console.error('Failed to save config', e);
    }
  };

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsAuthenticated(data.isAuthenticated);
    } catch (e) {
      console.error('Failed to check auth status', e);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleConnect = async () => {
    try {
      const response = await fetch('/api/auth/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();

      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        alert('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      alert('Failed to initiate LinkedIn connection. Check console for details.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsAuthenticated(false);
    } catch (e) {
      console.error('Failed to logout', e);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <PenTool className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">GenAI LinkedIn Poster</h1>
        </div>
        <div className="flex items-center gap-4">
          {isCheckingAuth ? (
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-emerald-600 flex items-center gap-1 font-medium bg-emerald-50 px-3 py-1 rounded-full">
                <CheckCircle2 className="w-4 h-4" /> Connected to LinkedIn
              </span>
              <button 
                onClick={handleLogout}
                className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="bg-[#0a66c2] hover:bg-[#004182] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              Connect LinkedIn
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-3 flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'generate' 
                ? 'bg-white text-indigo-600 shadow-sm border border-zinc-200/50' 
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <PenTool className="w-4 h-4" />
            Generate Post
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'config' 
                ? 'bg-white text-indigo-600 shadow-sm border border-zinc-200/50' 
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            Sources Config
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'chat' 
                ? 'bg-white text-indigo-600 shadow-sm border border-zinc-200/50' 
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            AI Assistant
          </button>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-9">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-sm border border-zinc-200/50 p-6 min-h-[600px]"
          >
            {activeTab === 'generate' && (
              <PostGenerator sources={sources} isAuthenticated={isAuthenticated} />
            )}
            {activeTab === 'config' && (
              <ConfigPanel sources={sources} setSources={handleSetSources} />
            )}
            {activeTab === 'chat' && (
              <Chatbot />
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
