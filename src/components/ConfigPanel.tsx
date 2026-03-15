import React, { useState } from 'react';
import { Plus, X, Globe, Info, Play, Loader2, CheckCircle2 } from 'lucide-react';

interface ConfigPanelProps {
  sources: string[];
  setSources: (sources: string[]) => void;
}

export default function ConfigPanel({ sources, setSources }: ConfigPanelProps) {
  const [newSource, setNewSource] = useState('');
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerStatus, setTriggerStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSource.trim() && !sources.includes(newSource.trim())) {
      setSources([...sources, newSource.trim()]);
      setNewSource('');
    }
  };

  const handleRemoveSource = (sourceToRemove: string) => {
    setSources(sources.filter(s => s !== sourceToRemove));
  };

  const handleTriggerAutoPost = async () => {
    setIsTriggering(true);
    setTriggerStatus('idle');
    try {
      const res = await fetch('/api/cron/trigger', { method: 'POST' });
      if (res.ok) {
        setTriggerStatus('success');
        setTimeout(() => setTriggerStatus('idle'), 3000);
      } else {
        setTriggerStatus('error');
      }
    } catch (e) {
      setTriggerStatus('error');
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-2">Sources Configuration</h2>
          <p className="text-zinc-500 text-sm">
            Add specific websites, blogs, or keywords you want the AI to prioritize when scanning for the latest GenAI developments.
          </p>
        </div>
        <button
          onClick={handleTriggerAutoPost}
          disabled={isTriggering}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70 shrink-0"
        >
          {isTriggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Test Auto-Post Now
        </button>
      </div>

      {triggerStatus === 'success' && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-3 text-sm mb-8">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p>Auto-post triggered! It will run in the background on the server.</p>
        </div>
      )}

      {triggerStatus === 'error' && (
        <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-3 rounded-xl flex items-center gap-3 text-sm mb-8">
          <X className="w-5 h-5 shrink-0" />
          <p>Failed to trigger auto-post.</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex gap-3 items-start">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">How this works</p>
          <p className="opacity-90 mb-2">
            When you generate a post, the AI will use Google Search to find the latest news. If you add sources here, it will append them to the search query (e.g., "site:techcrunch.com" or specific keywords) to guide the results.
          </p>
          <p className="font-medium text-indigo-700">
            🤖 Auto-Posting is active! The server will automatically generate a post and a mid-small image and publish it to LinkedIn every day at 10:00 AM IST.
          </p>
        </div>
      </div>

      <form onSubmit={handleAddSource} className="flex gap-3 mb-8">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder="e.g., site:techcrunch.com or 'OpenAI blog'"
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!newSource.trim()}
          className="bg-zinc-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Source
        </button>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-700 mb-4">Active Sources ({sources.length})</h3>
        
        {sources.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-xl">
            <p className="text-zinc-500 text-sm">No specific sources added.</p>
            <p className="text-zinc-400 text-xs mt-1">The AI will search the general web.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {sources.map((source, index) => (
              <div 
                key={index}
                className="flex items-center justify-between bg-white border border-zinc-200 p-3 rounded-lg group hover:border-zinc-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-zinc-100 p-1.5 rounded-md">
                    <Globe className="w-4 h-4 text-zinc-500" />
                  </div>
                  <span className="text-sm font-medium text-zinc-700">{source}</span>
                </div>
                <button
                  onClick={() => handleRemoveSource(source)}
                  className="text-zinc-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove source"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
