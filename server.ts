import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

// Note: In a real production app, we would use Firebase Admin SDK to verify these 
// but for the AI Studio preview environment, we orchestrate via Express.

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Setup storage for pending uploads
  const storage = multer.memoryStorage();
  const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  // In-memory store for demo purposes (Normally this is Firestore)
  const jobs = new Map();

  // API Routes
  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const fileId = uuidv4();
    res.json({
      fileId,
      fileName: req.file.originalname,
      url: `https://storage.googleapis.com/atx-demo-storage/${fileId}`,
      size: req.file.size
    });
  });

  app.post("/api/create-job", (req, res) => {
    const { fileId, config, amount } = req.body;
    const token = `ATX-${Math.random().toString(36).substring(7).toUpperCase()}`;
    const job = {
      id: "job_" + uuidv4(),
      fileId,
      config,
      amount,
      token,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    jobs.set(token, job);
    res.json(job);
  });

  app.get("/api/jobs", (req, res) => {
    res.json(Array.from(jobs.values()));
  });

  app.post("/api/payment-verify", (req, res) => {
    const { token } = req.body;
    const job = jobs.get(token);
    if (job) {
      job.status = "paid";
      res.json({ success: true, job });
    } else {
      res.status(404).json({ error: "Job not found" });
    }
  });

  // Kiosk API
  app.get("/api/kiosk/job/:token", (req, res) => {
    const { token } = req.params;
    const job = jobs.get(token);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "paid") return res.status(403).json({ error: "Job not paid" });
    
    res.json({
      ...job,
      printUrl: `https://api.atx.com/download/${job.fileId}`
    });
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
    console.log(`ATX Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
