import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { aiRouter } from './routes/ai.js';
import { healthRouter } from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/health', healthRouter);
app.use('/api/ai', aiRouter);

app.listen(PORT, () => {
  console.log(`[server] IFC Viewer backend running on port ${PORT}`);
});

export { app };
