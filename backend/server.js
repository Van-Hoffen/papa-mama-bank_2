const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; // Dynamically uses PORT from env or falls back to 3000 (production)

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Import routes
const authRoutes = require('./routes/auth');
const depositRoutes = require('./routes/deposits');
const operationRoutes = require('./routes/operations');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const familyRoutes = require('./routes/family');
const childrenRoutes = require('./routes/children');
const banksRoutes = require('./routes/banks');
const rateChangeProposalRoutes = require('./routes/rateChangeProposals');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');

// Database initialization
const db = require('./models/db');
db.initDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/banks', banksRoutes);
app.use('/api/rate-change-proposals', rateChangeProposalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// SPA routing fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});