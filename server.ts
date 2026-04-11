import "dotenv/config";
import express from "express";
import path from "path";
import axios from "axios";
import fs from "fs/promises";
import { GoogleGenAI } from "@google/genai";

const DATA_FILE = path.join(process.cwd(), "auth_data.json");
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3-flash-preview";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const MAX_TEXT_GENERATION_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(): number {
  return Math.random() < 0.5 ? 60_000 : 120_000;
}

function isLlmBusy503Error(error: any): boolean {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  if (status !== 503) return false;

  const message = String(
    error?.message ?? error?.response?.data?.error?.message ?? error?.response?.data ?? ""
  ).toLowerCase();

  return message.includes("busy") || message.includes("overloaded") || message.includes("unavailable");
}

async function generateTextWithRetry(ai: GoogleGenAI, request: any): Promise<any> {
  let attempt = 0;

  while (attempt <= MAX_TEXT_GENERATION_RETRIES) {
    try {
      return await ai.models.generateContent(request);
    } catch (error: any) {
      const isRetryable = isLlmBusy503Error(error);
      const hasMoreRetries = attempt < MAX_TEXT_GENERATION_RETRIES;

      if (!isRetryable || !hasMoreRetries) {
        throw error;
      }

      const delayMs = getRetryDelayMs();
      const retryNumber = attempt + 1;

      console.warn(
        `Text generation got 503 LLM busy. Retry ${retryNumber}/${MAX_TEXT_GENERATION_RETRIES} in ${Math.round(
          delayMs / 1000
        )}s...`
      );

      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw new Error("Text generation failed after retries");
}

function hasPromptLeakage(text: string): boolean {
  const leakPatterns = [
    /strategy\s*phase/i,
    /execution\s*phase/i,
    /post\s*archetype/i,
    /the\s+practitioners\s+playbook/i,
  ];

  return leakPatterns.some((pattern) => pattern.test(text));
}

function sanitizeGeneratedPost(text: string): string {
  let cleaned = text;

  // If the model prints process sections, keep only content after execution phase.
  const executionSplit = cleaned.split(/#{0,6}\s*execution\s*phase\s*:?/i);
  if (executionSplit.length > 1) {
    cleaned = executionSplit[executionSplit.length - 1];
  }

  cleaned = cleaned
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/^\s*#{1,6}.*$/gm, "")
    .replace(/^\s*\*\*.*\*\*\s*$/gm, "")
    .trim();

  return cleaned;
}

async function getAuthData() {
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return { token: null, urn: null, sources: [] };
  }
}

async function saveAuthData(newData: any) {
  const current = await getAuthData();
  await fs.writeFile(DATA_FILE, JSON.stringify({ ...current, ...newData }, null, 2));
}

async function publishToLinkedIn(token: string, urn: string, text: string, imageUrl?: string) {
  let mediaId = null;

  if (imageUrl && imageUrl.startsWith("data:image")) {
    const registerResponse = await axios.post(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: urn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const uploadUrl = registerResponse.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
    mediaId = registerResponse.data.value.asset;

    const base64Data = imageUrl.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    await axios.put(uploadUrl, buffer, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
    });
  }

  const postBody: any = {
    author: urn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: text,
        },
        shareMediaCategory: mediaId ? "IMAGE" : "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  if (mediaId) {
    postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [
      {
        status: "READY",
        description: {
          text: "Generated Image",
        },
        media: mediaId,
      },
    ];
  }

  const postResponse = await axios.post("https://api.linkedin.com/v2/ugcPosts", postBody, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  return postResponse.data;
}

async function generateAndPostToLinkedIn() {
  try {
    const data = await getAuthData();
    if (!data.token || !data.urn) {
      console.error("Auto-post failed: No LinkedIn account connected.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Rotate topics based on the day of the week to ensure variety

  const topics = [
  // Core Agentic Systems
  "Self-healing agent systems: Designing workflows that detect, debug, and recover autonomously",
  "Agent orchestration vs autonomy: Where should humans stay in the loop?",
  "Memory architectures for agents: Short-term context vs long-term knowledge graphs",
  // Architecture & Models
  "State-Space Models vs Transformers: The future of long-context efficiency",
  "World models in AI: From text prediction to environment simulation",
  "Neural-symbolic systems: Can logic finally tame hallucinations?",
  "Small models, big impact: Are we overestimating the need for frontier models?",

  // Efficiency & Deployment
  "Model distillation pipelines: Turning frontier intelligence into edge-ready systems",
  "Quantization strategies: How far can we compress intelligence without losing reasoning?",
  "Local-first AI: Privacy, latency, and cost advantages of on-device models",
  "Caching, batching, and routing: The hidden levers of LLM system performance",

  // RAG & Knowledge Systems
  "Context engineering vs prompt engineering: The next evolution",

  // Reliability & Evaluation
  "Failure-aware AI systems: Designing for graceful degradation, not blind confidence",
  "Determinism in LLMs: Is reproducibility even achievable?",
  "Trust boundaries in AI systems: Where should you never rely on an LLM?",

  // Economics & Scaling
  "FinOps for GenAI: Managing token economics at scale",
  "Cost vs capability: When does a cheaper model outperform a smarter one?",
  "Latency vs intelligence trade-offs in real-time AI systems",

  // AGI & Future Direction
  "AGI timelines: Are we closer than expected or fundamentally stuck?",
  "From copilots to autopilots: When should AI take full control?",
  "Recursive self-improvement: Hype or inevitable reality?",
  "Embodied AI: Why intelligence may require interaction with the physical world",
  "Cognitive architectures: Are we missing the bigger picture beyond LLMs?",

  // Ethics, Risk & Society
  "AI alignment in practice: Can we really control autonomous systems?",

  // Cutting-edge & Debatable
  "Is prompt engineering a temporary skill or a foundational discipline?",
  "Do LLMs actually reason or just simulate reasoning convincingly?",
];


    // Randomly select a topic from the list to ensure more variety in posts, especially if the server restarts or if there are multiple posts in a day
    // Generates a random index between 0 and topics.length - 1
    const randomIndex = Math.floor(Math.random() * topics.length);
    const selectedTopic = topics[randomIndex];

    let prompt = `Search the internet for recent research progress, breakthroughs, and deep-dive insights regarding "${selectedTopic}" in the field of AI and Generative AI. `;

    if (data.sources && data.sources.length > 0) {
        prompt += `Focus specifically on insights from these sources or related to these keywords: ${data.sources.join(', ')}. `;
    }

    prompt += "Write the final LinkedIn post only.";

// const strategyInstruction = `
//   You are writing one production-ready LinkedIn post.

//   ### Internal reasoning policy:
//   - Privately analyze the findings and choose one post archetype: Contrarian, Narrative, Comparison, Practitioners Playbook, or Visionary.
//   - Never reveal analysis, phase labels, archetype selection notes, or scratchpad text.
//   - Never output headings such as STRATEGY PHASE or EXECUTION PHASE.

//   ### Output requirements:
//   1. DYNAMIC FLOW: Avoid repetitive templates. Mix punchy lines and flowing observations.
//   2. TEXT STYLE: Do not use asterisks (**) for bold or underscores (_) for italics. (The hash symbol # is ONLY permitted for hashtags at the end). Use ALL CAPS sparingly.
//   3. VISUALS: Start with a relevant emoji in the opening line. Use emojis naturally throughout.
//   4. FORMAT: 1-2 sentence paragraphs. Sound organic and more human. Use clear, direct language. 
//   5. CONSTRAINTS: Under 1000 characters total. No intro/conclusion filler. 
//   6. HOOK + CTA: Begin with a curiosity hook and end with one specific thought-provoking question.
//   7. HASHTAGS (MANDATORY): End the post with exactly 3-5 relevant hashtags (e.g., #GenAI #AI #TechTrends). This is a hard requirement.
//   `;

const strategyInstruction = ` 
You are writing one production-ready LinkedIn post.

### Internal reasoning policy:
- Privately analyze the findings and choose one post archetype: Contrarian, Narrative, Comparison, Practitioners Playbook, or Visionary.
- Do not Output internal thinking, analysis, phase labels, archetype selection notes, or scratchpad text.
 
### Output requirements:
1. DYNAMIC FLOW: Avoid repetitive templates. Mix punchy lines and flowing observations.
2. TEXT STYLE: Do not use asterisks (**) for bold or underscores (_) for italics. (The hash symbol # is ONLY permitted for hashtags at the end). Use ALL CAPS sparingly.
3. VISUALS: Start with a relevant emoji in the opening line. Use emojis naturally throughout.
4. FORMAT: 1-2 sentence paragraphs. Sound organic and more human. Use clear, direct language. 
5. CONSTRAINTS: Main post must be under 1200 characters.  
6. HOOK + CTA: Begin with a curiosity hook and end with one specific thought-provoking question.
7. Last Line of the post should be 3–5 topic relevant hashtags for example #GenAI, #AI, #TechTrends on the new line. 
 `;


    console.log(`Auto-post: Generating text for topic: ${selectedTopic}...`);
    let textResponse = await generateTextWithRetry(ai, {
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
      config: {
      systemInstruction: strategyInstruction,
      tools: [{ googleSearch: {} }], 
      httpOptions: { 
      timeout: 300000 // 300 seconds (5 minutes)
        }
      }
    });

    let text = sanitizeGeneratedPost(textResponse.text || "");

    if (text && hasPromptLeakage(text)) {
      console.warn("Auto-post: Detected prompt leakage, retrying with stricter output instruction...");
      textResponse = await generateTextWithRetry(ai, {
        model: GEMINI_TEXT_MODEL,
        contents: `Regenerate this as final LinkedIn post only with no phase labels, no analysis text, and no markdown headings:\n\n${text}`,
        config: {
          systemInstruction: strategyInstruction,
          httpOptions: {
            timeout: 300000,
          },
        },
      });

      text = sanitizeGeneratedPost(textResponse.text || "");
    }

    if (!text) throw new Error("Failed to generate text");

    // Safety net: LinkedIn has a hard limit of 3000 characters.
    if (text.length > 1500) {
      console.log(`Auto-post: Text was ${text.length} chars, truncating to 1500 to fit LinkedIn limits.`);
      text = text.substring(0, 1500) + "...";
    }

    console.log("Auto-post: Generating image...");

    // const imagePrompt = `
    // An engaging, high-quality conceptual illustration for a LinkedIn post about ${selectedTopic}. 
    // The post discusses: ${text.substring(0, 500)}...

    // ### Style Decision Logic:
    // - If the topic/content feels **futuristic, abstract, AI evolution, human-AI tension, or philosophical/forward-looking**, use a **dark, cinematic, glowing style**.
    // - If the topic/content feels **enterprise, architecture, systems design, governance, LLMOps, or practical implementation**, use a **light, clean, corporate style**.

    // ### Visual Instructions (Dynamic):

    // #### Option A — Dark Futuristic (when applicable):
    // - **Style:** Cinematic, cutting-edge, slightly abstract conceptual art.
    // - **Lighting:** Low-light with controlled highlights, soft glows, subtle neon accents.
    // - **Background:** Dark gradients (black, deep blue, violet) with depth.
    // - **Color Palette:** Electric blues, purples, subtle neon accents. Avoid clutter.
    // - **Composition:** Layered depth, flowing data, networks, or human-AI interaction visuals. Slightly dramatic but still professional.

    // #### Option B — Light Professional (when applicable):
    // - **Style:** Clean, minimalist, modern technical aesthetic (high-end corporate infographic).
    // - **Lighting:** Bright, well-lit, natural light studio setting with crisp clarity.
    // - **Background:** Pure white, very light gray, or soft pastel gradient.
    // - **Color Palette:** Professional tones (blues, greens, grays) with subtle accents. No neon/glow.
    // - **Composition:** Structured layouts, isometric diagrams, precise flows, elegant system visualization.

    // ### General Requirements:
    // - Keep it visually striking but **LinkedIn-appropriate (not overly artistic or chaotic)**.
    // - Avoid text in the image.
    // - Focus on **clarity of concept + visual storytelling of AI systems or ideas**.
    // `;    

const imagePrompt = `
An engaging, high-quality conceptual image for a LinkedIn post about ${selectedTopic}. 
The post discusses: ${text.substring(0, 500)}...

### CRITICAL: ANTI-REPETITION DIRECTIVE
- Avoid generic engineering drawings, flat diagrams, basic flowcharts, or simple node-link graphs unless absolutely essential.
- Each generated image must feel visually distinct from typical AI/tech illustrations.
- Prioritize novelty, depth, and originality over safe patterns.

### CRITICAL: VISUAL DIVERSITY ENGINE (MANDATORY)
Before generating, internally randomize and apply:
- Perspective: macro / wide-angle / top-down / cinematic close-up
- Environment: physical space / abstract void / studio / architectural / natural fusion
- Material: glass / metal / liquid / holographic / particles / energy fields
- Lighting: soft studio / neon glow / volumetric light / high contrast / ambient diffusion

### CRITICAL: METAPHOR SELECTION
Do NOT default to diagrams. Represent the concept using ONE strong metaphor:
- Physical systems (machines, structures, layered constructs)
- Spatial metaphors (corridors, networks as environments, expanding spaces)
- Abstract forms (fields, distortions, gravity wells, signal flows)
- Human-tech interaction (without literal faces or robots)

### STYLE SELECTION (Flexible, NOT rigid)
Choose a dominant style based on intent, but allow creative blending if needed:

1. Architectural / Systemic (only if truly required)
2. Process Flow (avoid flat diagrams — make it spatial and immersive)
3. Network / Data Field (dense, atmospheric, not simplistic nodes)
4. Conceptual 3D Metaphor (default)
5. Cinematic Deep Tech (for tension, risk, ethics)

### COMPOSITION RULES
- The subject must dominate 60–80% of the frame
- Avoid empty backgrounds — always add depth, layers, or subtle structures
- Elements should feel large-scale and immersive
- Use depth of field and foreground/background layering

### AVOID THESE COMMON FAILURES
- Tiny centered objects with empty space
- Repetitive blueprint/grid visuals
- Basic circles-and-lines diagrams
- Flat infographic style
- Overused “AI brain” or glowing orb clichés

### QUALITY BAR
- Ultra-detailed, high depth, premium rendering
- LinkedIn-appropriate, clean, and sharp
- No text, no labels, no code

`;

    const imageResponse = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: { parts: [{ text: imagePrompt }] },
      config: {
      // Crucial for heavy image generation tasks
      httpOptions: { 
        timeout: 300000 // 300 seconds (5 minutes)
        }
      }
    });

    let base64Image = '';
    if (imageResponse.candidates && imageResponse.candidates[0]?.content?.parts) {
      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    console.log("Auto-post: Publishing to LinkedIn...");
    await publishToLinkedIn(data.token, data.urn, text, base64Image);
    console.log("Auto-post: Successfully published to LinkedIn!");
  } catch (error) {
    console.error("Auto-post error:", error);
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 8080);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));


  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // LinkedIn OAuth Routes
  app.get("/api/auth/url", (req, res) => {
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID || "",
      redirect_uri: redirectUri,
      state: "random_state_string",
      scope: "openid profile email w_member_social",
    });

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`Error: ${error_description}`);
    }

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const redirectUri = `${process.env.APP_URL}/auth/callback`;
      const tokenResponse = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
          client_id: process.env.LINKEDIN_CLIENT_ID || "",
          client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const accessToken = tokenResponse.data.access_token;

      // Fetch user profile to get the URN (person ID)
      const profileResponse = await axios.get("https://api.linkedin.com/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const personUrn = `urn:li:person:${profileResponse.data.sub}`;

      // Store in cookie
      res.cookie("linkedin_token", accessToken, {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
      });

      res.cookie("linkedin_urn", personUrn, {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 60 * 24 * 60 * 60 * 1000,
      });

      // Save to persistent storage for background cron jobs
      await saveAuthData({ token: accessToken, urn: personUrn });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("OAuth Error:", err.response?.data || err.message);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/status", (req, res) => {
    const token = req.cookies.linkedin_token;
    res.json({ isAuthenticated: !!token });
  });

  app.post("/api/auth/logout", async (req, res) => {
    res.clearCookie("linkedin_token", { secure: true, sameSite: "none", httpOnly: true });
    res.clearCookie("linkedin_urn", { secure: true, sameSite: "none", httpOnly: true });
    await saveAuthData({ token: null, urn: null });
    res.json({ success: true });
  });

  app.get("/api/config", async (req, res) => {
    const data = await getAuthData();
    res.json({ sources: data.sources || [] });
  });

  app.post("/api/config", async (req, res) => {
    const { sources } = req.body;
    await saveAuthData({ sources });
    res.json({ success: true });
  });

  app.all("/api/cron/trigger", async (req, res) => {
    // Optional security check: If CRON_SECRET is set in env, require it in the query string
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.query.secret !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }


  try 
  {
    // Wait for the LLMs to finish before sending the response
    await generateAndPostToLinkedIn(); 
    res.json({ success: true, message: "Post completed successfully" });
  } 
  catch (error) 
  {
    console.error("Task failed:", error);
    res.status(500).json({ error: "Post failed" });
  }
  });

  app.post("/api/linkedin/post", async (req, res) => {
    const token = req.cookies.linkedin_token;
    const urn = req.cookies.linkedin_urn;

    if (!token || !urn) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { text, imageUrl } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    try {
      const result = await publishToLinkedIn(token, urn, text, imageUrl);
      res.json({ success: true, id: result.id });
    } catch (err: any) {
      console.error("LinkedIn Post Error:", err.response?.data || err.message);
      res.status(500).json({ error: "Failed to post to LinkedIn", details: err.response?.data });
    }
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer();
