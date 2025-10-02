const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: './config.env' });

// Import routes
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const submissionRoutes = require('./routes/submissions');
const examAttemptRoutes = require('./routes/examAttempts');

// Import GridFS configuration
const { initGridFS } = require('./config/gridfs');

const app = express();
const PORT = process.env.PORT || 5000;

// Function to find available port
const findAvailablePort = (port) => {
  return new Promise((resolve, reject) => {
    const server = require('http').createServer();
    server.listen(port, () => {
      const foundPort = server.address().port;
      server.close(() => resolve(foundPort));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        findAvailablePort(port + 1).then(resolve);
      } else {
        reject(err);
      }
    });
  });
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/exam-attempts', examAttemptRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Exam Tester API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 10MB.'
    });
  }
  
  if (err.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({
      success: false,
      message: 'Only PDF files are allowed for exam uploads.'
    });
  }
  
  if (err.message.includes('Only PDF, JPG, and PNG files are allowed')) {
    return res.status(400).json({
      success: false,
      message: 'Only PDF, JPG, and PNG files are allowed for answer uploads.'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('✅ Connected to MongoDB Atlas');
  
  // Initialize GridFS
  try {
    await initGridFS();
    console.log('✅ GridFS initialized successfully');
  } catch (error) {
    console.error('❌ GridFS initialization error:', error);
    process.exit(1);
  }
  
  // Find available port and start server
  try {
    const availablePort = await findAvailablePort(PORT);
    app.listen(availablePort, () => {
      console.log(`🚀 Server running on port ${availablePort}`);
      console.log(`📚 Exam Tester API is ready!`);
      console.log(`🔗 Health check: https://exam-tester-backend.onrender.com/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

module.exports = app;
