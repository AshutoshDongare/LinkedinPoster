import { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader2, Sparkles, Image as ImageIcon, Send, CheckCircle2, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface PostGeneratorProps {
  sources: string[];
  isAuthenticated: boolean;
}

export default function PostGenerator({ sources, isAuthenticated }: PostGeneratorProps) {
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  
  const [generatedText, setGeneratedText] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  
  const [postStatus, setPostStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleGenerateText = async () => {
    setIsGeneratingText(true);
    setPostStatus('idle');
    setErrorMessage('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
    const topics = [
      "The reality of AI replacing jobs vs. augmenting them",
      "Why most enterprise AI projects fail in production",
      "The hidden environmental and compute costs of Generative AI",
      "How AI is changing the daily life of software engineers",
      "The truth about 'AGI' timelines and industry hype",
      "Practical AI use cases that actually save time today",
      "The impact of AI on junior developers and entry-level tech jobs",
      "Data privacy and security realities in the age of LLMs",
      "Open Source AI vs. Closed Models: Who is winning?",
      "The shift from building apps to building AI agents",
      "Burnout and the fast-paced reality of the tech industry",
      "How non-technical founders are building tech companies with AI",
      "The future of remote work and asynchronous tech teams",
      "Why soft skills are becoming more important than coding skills",
      "The biggest misconceptions people have about Generative AI",
      "How AI is transforming education and continuous learning in tech",
      "The ethical dilemmas tech companies are facing right now",
    ];



      const selectedTopic = topics[Math.floor(Math.random() * topics.length)];

      let prompt = `Search the internet for recent research progress, breakthroughs, and deep-dive insights regarding "${selectedTopic}" in the field of AI and Generative AI. `;
      if (sources.length > 0) {
        prompt += `Focus specifically on insights from these sources or related to these keywords: ${sources.join(', ')}. `;
      }
    
     prompt += `Write a highly engaging, viral-style LinkedIn post about this specific topic for a general tech and business audience. Follow these strict formatting rules: 1. Start with a strong, contrarian, or curiosity-inducing hook. 2. Keep it concise and highly readable (short paragraphs of 1-2 sentences). 3. FORMATTING IS CRITICAL: LinkedIn does NOT support markdown asterisks (**). Do NOT use asterisks. Instead, use ALL CAPS for headers and to emphasize important terms. 4. Use emojis as bullet points to break up the text visually. 5. Focus on relatable realities, actionable insights, or thought-provoking perspectives rather than deep technical jargon. 6. End with a specific, thought-provoking question to drive comments. 7. Include 3-5 relevant hashtags. 8. Do NOT include any introductory or concluding remarks. IMPORTANT: The entire post MUST be strictly under 1500 characters.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      setGeneratedText(response.text || '');
    } catch (error: any) {
      console.error('Text generation error:', error);
      setErrorMessage(error.message || 'Failed to generate text.');
    } finally {
      setIsGeneratingText(false);
    }
  };

  const handleGenerateImage = async () => {
    try {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }
      
      setIsGeneratingImage(true);
      setPostStatus('idle');
      setErrorMessage('');

      // Create a new instance right before making the call to ensure it uses the latest key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
      
      const prompt = `An engaging, professional, high-quality illustration for a LinkedIn post about: ${generatedText.substring(0, 200)}...`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: imageSize
          }
        }
      });

      let foundImage = false;
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            setGeneratedImage(`data:image/png;base64,${base64EncodeString}`);
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage) {
        throw new Error("No image was returned by the model.");
      }

    } catch (error: any) {
      console.error('Image generation error:', error);
      
      // Handle race condition where key might not be found
      if (error.message?.includes("Requested entity was not found")) {
        if (window.aistudio) {
          await window.aistudio.openSelectKey();
          setErrorMessage("Please select a valid API key and try again.");
        }
      } else {
        setErrorMessage(error.message || 'Failed to generate image.');
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handlePostToLinkedIn = async () => {
    if (!isAuthenticated) {
      setErrorMessage("Please connect your LinkedIn account first.");
      return;
    }

    setIsPosting(true);
    setPostStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/linkedin/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: generatedText,
          imageUrl: generatedImage || undefined
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to post to LinkedIn');
      }

      setPostStatus('success');
    } catch (error: any) {
      console.error('LinkedIn post error:', error);
      setPostStatus('error');
      setErrorMessage(error.message || 'Failed to post to LinkedIn.');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-2">Generate Post</h2>
          <p className="text-zinc-500 text-sm">
            Scan the web for GenAI news and create a ready-to-publish LinkedIn post.
          </p>
        </div>
        <button
          onClick={handleGenerateText}
          disabled={isGeneratingText}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70"
        >
          {isGeneratingText ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isGeneratingText ? 'Scanning & Generating...' : 'Scan & Generate Content'}
        </button>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      )}

      {postStatus === 'success' && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-4 py-3 rounded-xl flex items-start gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p>Successfully posted to LinkedIn!</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-700">Post Content</h3>
          </div>
          <div className="relative">
            <textarea
              value={generatedText}
              onChange={(e) => setGeneratedText(e.target.value)}
              placeholder="Your generated post content will appear here. You can edit it before posting."
              className="w-full h-[400px] p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm resize-none"
            />
          </div>
        </div>

        {/* Image Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between h-5">
            <h3 className="text-sm font-medium text-zinc-700">Post Image</h3>
            {generatedText && (
              <div className="flex items-center gap-2">
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as any)}
                  className="text-xs border border-zinc-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
                <button
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage || !generatedText}
                  className="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isGeneratingImage ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ImageIcon className="w-3 h-3" />
                  )}
                  Generate Image
                </button>
              </div>
            )}
          </div>
          
          <div className="w-full h-[400px] bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-center overflow-hidden relative">
            {generatedImage ? (
              <img 
                src={generatedImage} 
                alt="Generated for post" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-center text-zinc-400 flex flex-col items-center gap-2">
                <ImageIcon className="w-8 h-8 opacity-50" />
                <p className="text-sm">No image generated yet</p>
              </div>
            )}
            
            {isGeneratingImage && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <p className="text-sm font-medium text-zinc-700">Generating masterpiece...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-zinc-100">
        <button
          onClick={handlePostToLinkedIn}
          disabled={!generatedText || isPosting || !isAuthenticated}
          className="bg-[#0a66c2] hover:bg-[#004182] text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPosting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {isPosting ? 'Publishing...' : 'Publish to LinkedIn'}
        </button>
      </div>
    </div>
  );
}
