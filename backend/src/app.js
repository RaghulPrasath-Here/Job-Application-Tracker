require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const app = express();

// Security
app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Rate limiting
app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));
app.use('/api/sync', rateLimit({ windowMs: 60 * 1000, max: 5 })); 

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/sync', require('./routes/sync'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Error handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});