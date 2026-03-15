import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

const app = express();
const distDir = join(__dirname, 'dist');

// Serve static files
app.use(express.static(distDir));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend static server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving: ${distDir}`);
});
