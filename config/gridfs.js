const mongoose = require('mongoose');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage').GridFsStorage;
const Grid = require('gridfs-stream');

// Create GridFS connection
let gfs;
let gfsBucket;

// Initialize GridFS
const initGridFS = () => {
  return new Promise((resolve, reject) => {
    const conn = mongoose.connection;
    
    // Check if connection is already open
    if (conn.readyState === 1) {
      // Connection is already open, initialize immediately
      try {
        // Initialize GridFS stream
        gfs = Grid(conn.db, mongoose.mongo);
        gfs.collection('exams');
        
        // Initialize GridFS bucket
        gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
          bucketName: 'exams'
        });
        
        console.log('GridFS initialized successfully');
        resolve({ gfs, gfsBucket });
      } catch (error) {
        console.error('GridFS initialization error:', error);
        reject(error);
      }
    } else {
      // Connection not ready, wait for open event
      conn.once('open', () => {
        try {
          // Initialize GridFS stream
          gfs = Grid(conn.db, mongoose.mongo);
          gfs.collection('exams');
          
          // Initialize GridFS bucket
          gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
            bucketName: 'exams'
          });
          
          console.log('GridFS initialized successfully');
          resolve({ gfs, gfsBucket });
        } catch (error) {
          console.error('GridFS initialization error:', error);
          reject(error);
        }
      });
      
      conn.on('error', (error) => {
        console.error('GridFS connection error:', error);
        reject(error);
      });
    }
  });
};

// Configure GridFS storage for multer
const createGridFSStorage = () => {
  const storage = new GridFsStorage({
    url: process.env.MONGO_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
    file: (req, file) => {
      // Only accept PDF files for exams
      if (file.mimetype === 'application/pdf') {
        return {
          bucketName: 'exams',
          filename: `exam_${Date.now()}_${file.originalname}`,
          metadata: {
            originalName: file.originalname,
            uploadedBy: req.user ? req.user.id : null,
            uploadedAt: new Date(),
            contentType: file.mimetype
          }
        };
      } else {
        return null; // Reject non-PDF files
      }
    }
  });
  
  return storage;
};

// Multer middleware for GridFS
const uploadExamFile = multer({
  storage: createGridFSStorage(),
  fileFilter: (req, file, cb) => {
    // Allow PDF and image files
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, and PNG files are allowed for exam uploads'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

module.exports = {
  initGridFS,
  uploadExamFile,
  getGFS: () => gfs,
  getBucket: () => gfsBucket
};
