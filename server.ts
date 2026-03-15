import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cookieParser from "cookie-parser";
import axios from "axios";
import cron from "node-cron";
import fs from "fs/promises";
import { GoogleGenAI } from "@google/genai";

const DATA_FILE = path.join(process.cwd(), "auth_data.json");

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
      "AI Agents and Multi-Agent Systems",
      "Advances in Multimodal Foundation Models",
      "AI in Healthcare and Scientific Discovery",
      "Efficient AI: Quantization and Small Language Models (SLMs)",
      "AI Alignment, Safety, and Interpretability",
      "Retrieval-Augmented Generation (RAG) and Long-Context Models",
      "Generative Video, Audio, and 3D Models",
      "World Models and Embodied AI",
      "Synthetic Data Generation and Data-Centric AI",
      "AI for Code Generation and Autonomous Software Engineering",
      "Continual Learning and Lifelong Foundation Models",
      "Neuro-Symbolic AI and Hybrid Reasoning Systems",
      "Memory-Augmented AI Systems",
      "AI-Native Operating Systems and Tool Use",
      "Diffusion Models and Next-Generation Generative Architectures",
      "Edge AI and On-Device Generative Models",
      "AI Evaluation, Benchmarking, and Robustness",
    ];
    // Use day of year to cycle through all 17 topics instead of just day of week
    const start = new Date(new Date().getFullYear(), 0, 0);
    const diff = new Date().getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const selectedTopic = topics[dayOfYear % topics.length];

    let prompt = `Search the internet for recent research progress, breakthroughs, and deep-dive insights regarding "${selectedTopic}" in the field of AI and Generative AI. `;
    if (data.sources && data.sources.length > 0) {
      prompt += `Focus specifically on insights from these sources or related to these keywords: ${data.sources.join(', ')}. `;
    }
    prompt += `Write an engaging, professional, and analytical LinkedIn post that goes deep into this specific topic. Do NOT write a generic news bulletin or a simple list of links. Instead, focus on the technical progress, real-world implications, and future potential of this specific area. Make it thought-provoking and insightful for an audience of tech professionals. Include relevant hashtags. Do not include any introductory or concluding remarks, just the post content itself.`;

    console.log(`Auto-post: Generating text for topic: ${selectedTopic}...`);
    const textResponse = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    const text = textResponse.text;

    if (!text) throw new Error("Failed to generate text");

    console.log("Auto-post: Generating image...");
    const imagePrompt = `An engaging, professional, high-quality conceptual illustration for a LinkedIn post about ${selectedTopic}. The post discusses: ${text.substring(0, 150)}... Make it visually striking, modern, and relevant to AI research.`;
    const imageResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: imagePrompt }] }
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

// Schedule cron job for 10:00 AM IST (04:30 AM UTC)
cron.schedule("30 4 * * *", () => {
  console.log("Running scheduled LinkedIn post (10 AM IST)");
  generateAndPostToLinkedIn();
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());

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

    // Fire and forget, don't block the request
    generateAndPostToLinkedIn();
    res.json({ success: true, message: "Auto-post triggered in background" });
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
