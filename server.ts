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
  "Why single LLM apps are dead: the rise of multi-agent systems",
  "From copilots to autonomous workflows: where agents actually deliver ROI",
  "The architecture of production-grade agentic systems beyond demos",
  "Memory in AI systems: the real bottleneck nobody solved yet",
  "Context engineering vs prompt engineering: the real shift happening now",
  "Human-in-the-loop is not optional: designing controllable AI systems",

  "The tradeoff triangle: latency vs cost vs intelligence in LLM systems",
  "Small models with smart pipelines vs giant models: what actually wins",
  "The emergence of reasoning models vs generative models",

  "Build vs buy vs orchestrate: the new enterprise AI decision framework",
  "AI governance is becoming a product problem, not just a policy problem",
  "Why enterprise AI success depends more on workflows than models",
  "The rise of internal AI platforms and why every large company is building one",

  "Open-weight models vs API models: the real enterprise tipping point",
  "Why open-source AI is accelerating faster than expected",
  "The fragmentation of AI tooling: too many frameworks, no standards",

  "The productivity paradox: why AI does not always translate to business value",
  "AI-first startups vs AI-enabled enterprises: who has the advantage",

  "Stateless vs stateful AI systems: where long-term value actually lives",
  "Why evaluation pipelines are more critical than model selection",
  "LLMOps is DevOps + DataOps + PromptOps: why org structure matters more than tools",
  "The rise of AI reliability engineering as a new discipline",
  "Why most teams underestimate versioning in GenAI systems",
  "Caching strategies for LLM systems: the hidden lever for cost and latency",
  "Observability in AI systems: logs are not enough anymore",

  "The illusion of accuracy: why looks correct is dangerous in LLM outputs",
  "Why grounding data quality matters more than model quality",
  "The hardest part of GenAI is not generation—its validation",
  "Why deterministic systems are easier to scale than intelligent ones",
  "Failure modes of AI systems: what breaks in real-world deployments",
  "Why latency kills more AI products than bad models",
  "The integration problem: why GenAI fails at system boundaries",

  "Cognitive offloading: are we outsourcing thinking too early?",
  "From tool to dependency: when does AI stop augmenting and start replacing thinking?",
  "The skill shift: from knowing answers to asking better questions",
  "Will AI reduce deep expertise or amplify it?",
  "Why users trust confident AI more than correct AI",

  "The alignment gap: enterprise goals vs model objectives",
  "Shadow AI in enterprises: the governance challenge nobody talks about",
  "Bias in, confidence out: why LLMs amplify subtle data issues",
  "Auditability in GenAI: can we ever truly explain decisions?",
  "The ethics of synthetic humans: where do we draw the line?",

  "Will GenAI commoditize intelligence the way cloud commoditized compute?",
  "The shift from SaaS to Service-as-prompt: is UI becoming irrelevant?",
  "AI-native organizations: what changes when every workflow has intelligence embedded?",
  "The plateau question: are we nearing diminishing returns in scaling LLMs?",
  "From information retrieval to decision-making systems: the next leap",

  "Why most GenAI demos are unintentionally misleading",
  "AI wont replace jobs—but it will replace how jobs are evaluated",
  "The real moat in AI is not models, data, or infra—its iteration speed",
  "Why AI strategy decks fail without execution primitives",
  "The over-automation trap: just because we can automate doesnt mean we should",

  "Why agent communication protocols will define the next generation of AI systems",
  "The shift from APIs to intent-based interfaces in software design",
  "Why AI systems need failure-aware design, not just success optimization",
  "The emerging role of 'AI product managers' vs traditional PMs",
  "Why data contracts will become critical in GenAI ecosystems",
  "The difference between AI capability and AI usability",
  "Why most GenAI UX is broken and how it needs to evolve",
  "From prompts to policies: the abstraction shift in controlling AI behavior",
  "Why continuous learning systems are harder than static intelligence",
  "The rise of domain-specific AI models vs general-purpose models",
  "Why AI systems need simulation environments before real-world deployment",
  "The bottleneck is no longer intelligence, it is decision integration",
  "Why explainability may never catch up with capability",
  "The shift from model-centric to system-centric AI thinking",
  "Why enterprises will move from experimenting with AI to depending on it"
];



    // UNUSED - Date modulo topic count to ensure a different topic each day, cycling through the list
    // // Use day of year to cycle through all 17 topics instead of just day of week
    // const start = new Date(new Date().getFullYear(), 0, 0);
    // const diff = new Date().getTime() - start.getTime();
    // const oneDay = 1000 * 60 * 60 * 24;
    // const dayOfYear = Math.floor(diff / oneDay);
    // const selectedTopic = topics[dayOfYear % topics.length];

    // Randomly select a topic from the list to ensure more variety in posts, especially if the server restarts or if there are multiple posts in a day
    // Generates a random index between 0 and topics.length - 1
    const randomIndex = Math.floor(Math.random() * topics.length);
    const selectedTopic = topics[randomIndex];

    // Changing this static prompting logic with more dynamic 
    // let prompt = `Search the internet for recent research progress, breakthroughs, and deep-dive insights regarding "${selectedTopic}" in the field of AI and Generative AI. `;
    // if (data.sources && data.sources.length > 0) {
    //   prompt += `Focus specifically on insights from these sources or related to these keywords: ${data.sources.join(', ')}. `;
    // }

    // prompt += `Write a highly engaging, viral-style LinkedIn post about this specific topic for a general tech and business audience. Follow these strict formatting rules: 1. Start with a strong, contrarian, or curiosity-inducing hook. 2. Keep it concise and highly readable (short paragraphs of 1-2 sentences). 3. FORMATTING IS CRITICAL: LinkedIn does NOT support markdown asterisks (**). Do NOT use asterisks to emphasize important terms. 4. Use emojis as bullet points to break up the text visually. 5. Focus on relatable realities, actionable insights, or thought-provoking perspectives rather than deep technical jargon. 6. End with a specific, thought-provoking question to drive comments. 7. Include 3-5 relevant hashtags. 8. Do NOT include any introductory or concluding remarks. 9. use relevant emoji icon at the start of the title of the post. 10. make required variation in the format of the posts to avoide them feeling typecasted. IMPORTANT: The entire post MUST be strictly under 1500 characters. and Do not always mention like - In year 2026 or biggest thing of 2026 use the year number only when utmost necessory`;
    
    let prompt = `Search the internet for recent research progress, breakthroughs, and deep-dive insights regarding "${selectedTopic}" in the field of AI and Generative AI. `;

    if (data.sources && data.sources.length > 0) {
        prompt += `Focus specifically on insights from these sources or related to these keywords: ${data.sources.join(', ')}. `;
    }

    prompt += "Write the final LinkedIn post only.";

    const strategyInstruction = `
  You are writing one production-ready LinkedIn post.

  Internal reasoning policy:
  - Privately analyze the findings and choose one post archetype: Contrarian, Narrative, Comparison, Practitioners Playbook, or Visionary.
  - Never reveal analysis, phase labels, archetype selection notes, chain-of-thought, or scratchpad text.
  - Never output headings such as STRATEGY PHASE or EXECUTION PHASE.

  Output requirements:
  1. DYNAMIC FLOW: Avoid repetitive templates. Mix punchy lines and flowing observations.
  2. NO MARKDOWN: Do not use asterisks for bold. Use ALL CAPS sparingly.
  3. VISUALS: Start with a relevant emoji in the opening line. Use emojis naturally.
  4. FORMAT: 1-2 sentence paragraphs. Sound organic and human.
  5. CONSTRAINTS: Under 1500 characters. No intro/conclusion filler. Mention 2026 only if truly needed.
  6. HOOK + CTA: Begin with a curiosity hook and end with one specific thought-provoking question.
  7. HASHTAGS: Add 3-5 relevant hashtags at the end.
  8. FINAL-ONLY: Return only the final post text with no preface, labels, or explanations.
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
    if (text.length > 2950) {
      console.log(`Auto-post: Text was ${text.length} chars, truncating to 2950 to fit LinkedIn limits.`);
      text = text.substring(0, 2950) + "...";
    }

    console.log("Auto-post: Generating image...");
    // const imagePrompt = `An engaging, professional, high-quality conceptual illustration for a LinkedIn post about ${selectedTopic}. The post discusses: ${text.substring(0, 150)}... Make it visually striking, modern, and relevant to AI research.`;
    // const imagePrompt = `A professional, high-quality conceptual technical illustration for a LinkedIn post about ${selectedTopic}. 
    // The post discusses: ${text.substring(0, 500)}... 

    // ### Visual Instructions:
    // - **Style:** Clean, minimalist, modern technical aesthetic. Think high-end corporate infographic, not sci-fi.
    // - **Lighting:** Bright, well-lit, natural light studio setting. Crisp details.
    // - **Background:** Clean, neutral background (pure white, very light gray, or light pastel gradient). No dark environments or heavy bokeh.
    // - **Color Palette:** Professional and light. Use blues, greens, and grays with subtle accents of primary colors. Avoid oversaturated neons or "glowing" effects.
    // - **Composition:** Use precise lines, isometric view, or a clean diagrammatic layout. Visualize the AI concepts (like neural networks, data flow, or algorithms) as elegant, structured blueprints or transparent interfaces.
    // `;

    const imagePrompt = `
    An engaging, high-quality conceptual illustration for a LinkedIn post about ${selectedTopic}. 
    The post discusses: ${text.substring(0, 500)}...

    ### Style Decision Logic:
    - If the topic/content feels **futuristic, abstract, AI evolution, human-AI tension, or philosophical/forward-looking**, use a **dark, cinematic, glowing style**.
    - If the topic/content feels **enterprise, architecture, systems design, governance, LLMOps, or practical implementation**, use a **light, clean, corporate style**.

    ### Visual Instructions (Dynamic):

    #### Option A — Dark Futuristic (when applicable):
    - **Style:** Cinematic, cutting-edge, slightly abstract conceptual art.
    - **Lighting:** Low-light with controlled highlights, soft glows, subtle neon accents.
    - **Background:** Dark gradients (black, deep blue, violet) with depth.
    - **Color Palette:** Electric blues, purples, subtle neon accents. Avoid clutter.
    - **Composition:** Layered depth, flowing data, networks, or human-AI interaction visuals. Slightly dramatic but still professional.

    #### Option B — Light Professional (when applicable):
    - **Style:** Clean, minimalist, modern technical aesthetic (high-end corporate infographic).
    - **Lighting:** Bright, well-lit, natural light studio setting with crisp clarity.
    - **Background:** Pure white, very light gray, or soft pastel gradient.
    - **Color Palette:** Professional tones (blues, greens, grays) with subtle accents. No neon/glow.
    - **Composition:** Structured layouts, isometric diagrams, precise flows, elegant system visualization.

    ### General Requirements:
    - Keep it visually striking but **LinkedIn-appropriate (not overly artistic or chaotic)**.
    - Avoid text in the image.
    - Focus on **clarity of concept + visual storytelling of AI systems or ideas**.
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

    // // Fire and forget, don't block the request
    // generateAndPostToLinkedIn();
    // res.json({ success: true, message: "Auto-post triggered in background" });

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
