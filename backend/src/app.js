import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes/index.js';

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Mount Routes
app.use('/api', routes);
// Also support root paths for backward compatibility if needed, but standardizing on /api is better.
// The user prompt said: "Frontend (/api/*) requests".

export default app;
