const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Import routes
const authRoutes = require('./routes/auth');
const depositRoutes = require('./routes/deposits');
const operationRoutes = require('./routes/operations');
const analyticsRoutes = require('./routes/analytics');

// Database initialization
const db = require('./models/db');
db.initDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Serve static files
app.use(express.static('../frontend/build'));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});