const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Submissions = require('../models/Submission');
const { verifyToken, isTeacher } = require('../middleware/auth');
const { uploadExamFile, getBucket } = require('../config/gridfs');

const router = express.Router();

// @route   POST /api/exams
// @desc    Create new exam (Teacher only)
// @access  Private (Teacher)
router.post('/', verifyToken, isTeacher, uploadExamFile.single('examPdf'), [
  body('title').trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
  body('duration').isInt({ min: 1, max: 300 }).withMessage('Duration must be 1-300 minutes')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Exam file is required (PDF, JPG, or PNG)'
      });
    }

    const { title, duration } = req.body;

    // File is already uploaded to GridFS by multer middleware
    const examFileId = req.file.id;

    // Create exam in database
    const exam = new Exam({
      title,
      examFileId: examFileId,
      duration: parseInt(duration),
      createdBy: req.user.id
    });

    await exam.save();

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: {
        exam: {
          id: exam._id,
          title: exam.title,
          examFileId: exam.examFileId,
          duration: exam.duration,
          createdBy: exam.createdBy,
          createdAt: exam.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during exam creation'
    });
  }
});

// @route   GET /api/exams/file/:id
// @desc    Serve exam PDF file from GridFS or redirect to Cloudinary (Public access for iframe)
// @access  Public (only active exams)
router.get('/file/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    
    // Check if this is a Cloudinary URL (old data)
    if (fileId.startsWith('http')) {
      // Redirect to Cloudinary URL for old exams
      return res.redirect(fileId);
    }
    
    // Validate ObjectId format for GridFS
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file ID format'
      });
    }

    // Check if exam exists and user has access
    const exam = await Exam.findOne({ 
      $or: [
        { examFileId: fileId },
        { examPdfUrl: fileId }
      ]
    });
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam file not found'
      });
    }

    // If this is an old exam with Cloudinary URL, redirect to it
    if (exam.examPdfUrl && exam.examPdfUrl.startsWith('http')) {
      return res.redirect(exam.examPdfUrl);
    }

    // Check if exam is active (only active exams can be accessed)
    if (!exam.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: This exam is not currently active'
      });
    }

    // Get GridFS bucket
    const bucket = getBucket();
    if (!bucket) {
      return res.status(500).json({
        success: false,
        message: 'GridFS not initialized'
      });
    }

    // Get file metadata from GridFS to determine content type
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found in GridFS'
      });
    }
    
    const fileMetadata = files[0];
    const contentType = fileMetadata.contentType || 'application/pdf';
    const originalFilename = fileMetadata.filename || `${exam.title}.pdf`;

    // Create download stream
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));

    // Set response headers
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${originalFilename}"`,
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    });

    // Pipe the file to response
    downloadStream.pipe(res);

    // Handle errors
    downloadStream.on('error', (error) => {
      console.error('GridFS download error:', error);
      if (!res.headersSent) {
        res.status(404).json({
          success: false,
          message: 'File not found in GridFS'
        });
      }
    });

  } catch (error) {
    console.error('Serve exam file error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while serving exam file'
    });
  }
});

// @route   GET /api/exams
// @desc    Get exams (filtered by role: students see only active, teachers see only their own)
// @access  Private
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = {};
    
    // Students only see active exams, teachers see only their own active exams
    if (req.user.role === 'student') {
      query.isActive = true;
    } else if (req.user.role === 'teacher') {
      query.createdBy = req.user.id;
      query.isActive = true;
    }

    const exams = await Exam.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        exams: exams.map(exam => ({
          id: exam._id,
          title: exam.title,
          examFileId: exam.examFileId || exam.examPdfUrl, // Handle both old and new data
          duration: exam.duration,
          createdBy: {
            id: exam.createdBy._id,
            name: exam.createdBy.name,
            email: exam.createdBy.email
          },
          createdAt: exam.createdAt,
          isActive: exam.isActive
        }))
      }
    });

  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching exams'
    });
  }
});

// @route   GET /api/exams/:id
// @desc    Get specific exam
// @access  Private
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    res.json({
      success: true,
      data: {
        exam: {
          id: exam._id,
          title: exam.title,
          examFileId: exam.examFileId || exam.examPdfUrl, // Handle both old and new data
          duration: exam.duration,
          createdBy: {
            id: exam.createdBy._id,
            name: exam.createdBy.name,
            email: exam.createdBy.email
          },
          createdAt: exam.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching exam'
    });
  }
});

// @route   PUT /api/exams/:id/cancel
// @desc    Cancel exam (Teacher only, must be creator) - marks as inactive
// @access  Private (Teacher)
router.put('/:id/cancel', verifyToken, isTeacher, async (req, res) => {
  try {
    const examId = req.params.id;
    const teacherId = req.user.id;

    // Check if exam exists and was created by this teacher
    const exam = await Exam.findOne({
      _id: examId,
      createdBy: teacherId
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to cancel it'
      });
    }

    if (!exam.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Exam is already cancelled'
      });
    }

    // Mark exam as inactive instead of deleting
    await Exam.findByIdAndUpdate(examId, { isActive: false });

    res.json({
      success: true,
      message: 'Exam cancelled successfully. It is now hidden from students.',
      data: {
        cancelledExam: {
          id: exam._id,
          title: exam.title,
          status: 'inactive'
        }
      }
    });

  } catch (error) {
    console.error('Cancel exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling exam'
    });
  }
});

// @route   PUT /api/exams/:id/activate
// @desc    Reactivate exam (Teacher only, must be creator)
// @access  Private (Teacher)
router.put('/:id/activate', verifyToken, isTeacher, async (req, res) => {
  try {
    const examId = req.params.id;
    const teacherId = req.user.id;

    // Check if exam exists and was created by this teacher
    const exam = await Exam.findOne({
      _id: examId,
      createdBy: teacherId
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to activate it'
      });
    }

    if (exam.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Exam is already active'
      });
    }

    // Mark exam as active
    await Exam.findByIdAndUpdate(examId, { isActive: true });

    res.json({
      success: true,
      message: 'Exam reactivated successfully. It is now visible to students.',
      data: {
        activatedExam: {
          id: exam._id,
          title: exam.title,
          status: 'active'
        }
      }
    });

  } catch (error) {
    console.error('Activate exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while activating exam'
    });
  }
});

module.exports = router;
