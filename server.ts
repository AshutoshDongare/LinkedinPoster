import "dotenv/config";
import express from "express";
import path from "path";
import axios from "axios";
import fs from "fs/promises";
import { GoogleGenAI } from "@google/genai";

const DATA_FILE = path.join(process.cwd(), "auth_data.json");
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3-flash-preview";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

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
  // --- 1. Agentic Architectures & Multi-Agent Systems ---
  "Architectural patterns for multi-agent orchestration: Beyond the single-agent demo",
  "Agent communication protocols (MCP/A2A): Defining the 'Agent Internet'",
  "Memory in AI systems: Solving the context-window bottleneck with persistent state",
  "Human-in-the-loop by design: Engineering controllable autonomy in high-stakes tasks",
  "Self-healing workflows: Agents that detect and fix their own execution failures",

  // --- 2. Reasoning & The New Scaling Frontier ---
  "Test-time compute: Scaling reasoning at inference vs. scaling training data",
  "Process Reward Models (PRMs): Why the reasoning path matters more than the final answer",
  "Neural-Symbolic Hybrids: Combining LLM intuition with formal logic for zero-error systems",
  "World Models: Why the next leap in planning requires predictive visual simulation",
  "Multi-modal alignment: The 'Omni-model' loop where text, vision, and action merge",

  // --- 3. Efficiency, SLMs & Edge AI ---
  "The SLM revolution: Why domain-specific 7B-30B models are winning on Enterprise ROI",
  "State-Space Models (SSM) vs. Transformers: Finding the efficiency sweet spot for long context",
  "Quantization-aware fine-tuning: Running frontier-grade logic on local edge hardware",
  "Model-distillation pipelines: Transforming giant model knowledge into agile local assets",

  // --- 4. Reliability, Evaluation & AI Engineering ---
  "AI Reliability Engineering (ARE): Treating hallucinations as a system-stability problem",
  "Observability 2.0: Moving beyond logs to semantic monitoring and trace-based debugging",
  "Automated evaluation (Auto-Eval): Using 'Judge' models to scale quality control",
  "Versioning in non-deterministic systems: How to track 'logic drift' in prompt-based code",
  "Failure-aware design: Engineering systems that fail gracefully instead of confidently",

  // --- 5. Data, RAG & Knowledge Fabric ---
  "Agentic RAG: Transforming static retrieval into a dynamic, governed knowledge fabric",
  "Synthetic data generation: Solving the data-exhaustion problem for niche domain training",
  "Vector-graph hybrids: Why RAG needs structured relationships to answer complex queries",

  // --- 6. Governance, Ethics & Sovereignty ---
  "Sovereign AI: Why data residency and local infrastructure are the new 'moats'",
  "The EU AI Act & Technical Compliance: Automated audit trails for high-risk deployments",
  "Explainability vs. Capability: Are we building systems that are too complex to be auditable?",
  "The ethics of synthetic humans: Digital twins and the boundaries of identity in 2026",

  // --- 7. Business Logic & Organizational Impact ---
  "The Productivity Paradox: Why raw token output does not equal business value",
  "AI-native workflows: Redesigning business logic when the 'middle man' is an agent",
  "FinOps for GenAI: Managing the unit economics of autonomous agent tokens",
  "The Iteration Moat: Why speed of feedback loops beats model size in production"
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

const strategyInstruction = `
  You are writing one production-ready LinkedIn post.

  ### Internal reasoning policy:
  - Privately analyze the findings and choose one post archetype: Contrarian, Narrative, Comparison, Practitioners Playbook, or Visionary.
  - Never reveal analysis, phase labels, archetype selection notes, or scratchpad text.
  - Never output headings such as STRATEGY PHASE or EXECUTION PHASE.

  ### Output requirements:
  1. DYNAMIC FLOW: Avoid repetitive templates. Mix punchy lines and flowing observations.
  2. TEXT STYLE: Do not use asterisks (**) for bold or underscores (_) for italics. (The hash symbol # is ONLY permitted for hashtags at the end). Use ALL CAPS sparingly.
  3. VISUALS: Start with a relevant emoji in the opening line. Use emojis naturally throughout.
  4. FORMAT: 1-2 sentence paragraphs. Sound organic and more human. Use clear, direct language. 
  5. CONSTRAINTS: Under 1000 characters total. No intro/conclusion filler. 
  6. HOOK + CTA: Begin with a curiosity hook and end with one specific thought-provoking question.
  7. HASHTAGS (MANDATORY): End the post with exactly 3-5 relevant hashtags (e.g., #GenAI #AI #TechTrends). This is a hard requirement.
  `;

    console.log(`Auto-post: Generating text for topic: ${selectedTopic}...`);
    let textResponse = await ai.models.generateContent({
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
      textResponse = await ai.models.generateContent({
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

    ### CRITICAL: Framing & Composition Instructions (REQUIRED):
    - **Use Prominent Composition:** The central graphic elements must be large, dominant, and the clear hero of the image.
    - **Maximize Canvas Use:** Avoid vast, empty voids in the background. If the background is light, use textures or subtle background layers that connect to the main subject. If the background is dark, use deep atmospheric depth, but do not leave it blank.
    - **Allow Elements to Bleed:** In all styles except Style 2 (Flowchart), at least some key elements should extend to, or bleed off, the edge of the frame to suggest a larger system and fill the space.

    ### CRITICAL: Graphic Style Decision Logic (REQUIRED):
    Analyze the intent of ${selectedTopic} and the post text to select **exactly ONE** of the following visual styles. Do not mix styles. 

    #### STYLE 1: The Technical Draft (Blueprint/Architecture)
    - **Use For Topics Like:** "Architecture", "Systems design", "Infrastructure", "Quantization".
    - **Visual Style:** Large-scale technical drafting. This should not be a small diagram, but a sprawling, detailed blueprint that feels like it covers the entire frame.
    - **Details:** Massive isometric wireframes of software stacks, exploded views of core components, technical annotation lines. The elements should extend right to the edges of the canvas.
    - **Composition:** Wide-angle view, showing the blueprint spread across a vast desk, but the wireframes themselves are large and fill 90% of the viewable area.
    - **Color Palette:** Architectural Blue lines on White/Cream. Minimalist but *full*.
    - **Vibe:** Scale, precision, complexity.

    #### STYLE 2: The Logical Sequence (Process Flow/Workflow)
    - **Use For Topics Like:** "pipelines", "models", "Chain of Thought", "Human-in-the-loop", "CI/CD".
    - **Visual Style:** Dominant 3D infographic flowchart.
    - **Details:** The flowchart nodes (geometric shapes) are massive and take up significant screen real estate. The connections are clear and robust. The flow itself is the entire image.
    - **Composition:** A logical flow (left-to-right or top-to-bottom) where the individual steps are large enough to see detail, but framed tightly to fill the horizontal canvas.
    - **Color Palette:** Professional gradients (Corporate Blue, Mint Green, Soft Gray) against a bright, well-lit studio background. Use depth of field to keep the flow filling the space without cluttering it.
    - **Vibe:** Logic, sequence, and large-scale optimization.

    #### STYLE 3: The Data Web (Knowledge Graph/Network)
    - **Use For Topics Like:** "Memory", "Vector-graph hybrids", "RAG", "Data-exhuastion", "Domain-specific models".
    - **Visual Style:** Complex Network Diagram that feels immersive.
    - **Details:** Not a single small network cluster, but a visualization that surrounds the viewer. Hundreds of small nodes forming dense, massive clusters that sprawl from edge to edge.
    - **Composition:** Use an extremely deep depth of field. The nodes closest to the camera are blurry and bleed off the frame, while the central network logic is in sharp focus, creating a completely filled and immersive data landscape.
    - **Color Palette:** Shades of blue (sky, electric, deep) on a pure white or very light gray background.
    - **Vibe:** Interconnectedness, scale, and infinite complexity.

    #### STYLE 4: The Lucid Innovation (Modern 3D Concept) [Default for abstract innovation]
    - **Use For Topics Like:** "Productivity paradox", "AI-native organizations", "expertise", "Future of jobs".
    - **Visual Style:** Minimalist, prominent 3D metaphor. The single subject must dominate the frame.
    - **Details:** Example: A single, gigantic floating polished silver and glass metaphor for "Augmentation." Or a large, highly detailed human silhouette interacting with massive luminous interfaces.
    - **Composition:** Tight framing on the subject. The background is airy and bright, but the central metaphor takes up at least 60-70% of the canvas.
    - **Color Palette:** Pastels (Lavender, Soft Gold, Teal) on a pure white studio environment.
    - **Vibe:** Clarity, optimistic scale, and high-tech utility.

    #### STYLE 5: The Deep Tech Midnight (Dark/Cinematic) [Niche/Reserved]
    - **Use ONLY For Topics Like:** "Cybersecurity", "Ethics", "Explainability issues", "Black Box", "Tension".
    - **Visual Style:** Close-up, intense, "Cyber-technical."
    - **Details:** Macro-style composition focusing tightly on one intense, glowing technical core. The surroundings are dark, cinematic obsidian or deep navy, but filled with complex shadows and depth, not empty space.
    - **Composition:** Tight close-up or macro shot. The core structure is huge in the frame, making the viewer feel the scale and power of the concept.
    - **Color Palette:** Dominant Dark/Deep tones with single-color neon (e.g., Electric Blue only, or Red only) for intense, high-contrast highlights.
    - **Vibe:** Mystery, deep analysis, risk, and power.

    ### General Requirements:
    - NO literal "Robots" or "Terminators." Use architectural, mathematical, or structural metaphors.
    - Ensure the edges are crisp and professional (LinkedIn-appropriate).
    - No text or code inside the image.
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
