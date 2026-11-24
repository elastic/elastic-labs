import express from 'express';
import { initDb } from './db.js';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { picsRouter } from './routes/pics.js';
import { commentsRouter } from './routes/comments.js';

const app = express();
app.use(express.json());

app.use(authRouter);
app.use(picsRouter);
app.use(commentsRouter);

app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'Validation error',
      errors: [{ field: 'image', message: 'the image field is too large' }],
    });
  }
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

await initDb();
app.listen(config.port, () => {
  console.log(`API listening on ${config.port}`);
});
