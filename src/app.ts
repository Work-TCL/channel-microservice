import express from 'express';
import { router } from './routes/index.routes';
import './cron/index.cron'; // Import the cron jobs to ensure they are scheduled
import { releaseBlockedAmounts } from './controller/shopify/webhook/shopifyWebhook.controller';
const cors = require('cors')

require('dotenv').config();

const app = express();

app.use(cors())
app.use(express.json()); // Add this line to parse JSON bodies

app.use(router);

export default app;