const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const { verifyToken, isStudent, isTeacher } = require('../middleware/auth');
const { uploadAnswerFile } = require('../config/cloudinary');

const router = express.Router();

// Configure multer for answer file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `answer_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, and PNG files are allowed for answers'), false);
    }
  }
});

// @route   POST /api/submissions
// @desc    Submit answer (Student only)
// @access  Private (Student)
router.post('/', verifyToken, isStudent, upload.single('answerFile'), [
  body('examId').isMongoId().withMessage('Valid exam ID is required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      console.log('Request body:', req.body);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Answer file is required'
      });
    }

    const { examId } = req.body;

    // Check if exam exists
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check if student already submitted for this exam
    const existingSubmission = await Submission.findOne({
      studentId: req.user.id,
      examId: examId
    });

    if (existingSubmission) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted answers for this exam'
      });
    }

    // Upload answer file to Cloudinary
    const answerUrl = await uploadAnswerFile(req.file);

    // Create submission
    const submission = new Submission({
      studentId: req.user.id,
      examId: examId,
      answerUrl
    });

    await submission.save();

    // Populate submission data
    await submission.populate('studentId', 'name email');
    await submission.populate('examId', 'title duration');

    res.status(201).json({
      success: true,
      message: 'Answer submitted successfully',
      data: {
        submission: {
          id: submission._id,
          student: {
            id: submission.studentId._id,
            name: submission.studentId.name,
            email: submission.studentId.email
          },
          exam: {
            id: submission.examId._id,
            title: submission.examId.title,
            duration: submission.examId.duration
          },
          answerUrl: submission.answerUrl,
          submittedAt: submission.submittedAt
        }
      }
    });

  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during answer submission'
    });
  }
});

// @route   GET /api/submissions/:examId
// @desc    Get all submissions for an exam (Teacher only)
// @access  Private (Teacher)
router.get('/:examId', verifyToken, isTeacher, async (req, res) => {
  try {
    const { examId } = req.params;

    // Check if exam exists and was created by this teacher
    const exam = await Exam.findOne({
      _id: examId,
      createdBy: req.user.id
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to view its submissions'
      });
    }

    // Get all submissions for this exam
    const submissions = await Submission.find({ examId })
      .populate('studentId', 'name email')
      .populate('examId', 'title duration')
      .sort({ submittedAt: -1 });

    res.json({
      success: true,
      data: {
        exam: {
          id: exam._id,
          title: exam.title,
          duration: exam.duration,
          createdAt: exam.createdAt
        },
        submissions: submissions.map(submission => ({
          id: submission._id,
          student: {
            id: submission.studentId._id,
            name: submission.studentId.name,
            email: submission.studentId.email
          },
          answerUrl: submission.answerUrl,
          submittedAt: submission.submittedAt,
          status: submission.status
        }))
      }
    });

  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submissions'
    });
  }
});

// @route   GET /api/submissions
// @desc    Get all submissions (Admin) or submissions for teacher's exams (Teacher)
// @access  Private (Admin/Teacher)
router.get('/', verifyToken, async (req, res) => {
  try {
    let submissions;
    
    if (req.user.role === 'admin') {
      // Admin can see all submissions
      submissions = await Submission.find()
        .populate('studentId', 'name email')
        .populate('examId', 'title duration createdBy')
        .populate('examId.createdBy', 'name email')
        .sort({ submittedAt: -1 });
    } else if (req.user.role === 'teacher') {
      // Teacher can only see submissions for their own exams
      submissions = await Submission.find()
        .populate({
          path: 'examId',
          match: { createdBy: req.user.id },
          populate: { path: 'createdBy', select: 'name email' }
        })
        .populate('studentId', 'name email')
        .sort({ submittedAt: -1 });
      
      // Filter out submissions where examId is null (exams not created by this teacher)
      submissions = submissions.filter(submission => submission.examId !== null);
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin or Teacher role required.'
      });
    }

    res.json({
      success: true,
      data: {
        submissions: submissions.map(submission => ({
          id: submission._id,
          student: {
            id: submission.studentId._id,
            name: submission.studentId.name,
            email: submission.studentId.email
          },
          exam: {
            id: submission.examId._id,
            title: submission.examId.title,
            duration: submission.examId.duration,
            createdBy: {
              id: submission.examId.createdBy._id,
              name: submission.examId.createdBy.name,
              email: submission.examId.createdBy.email
            }
          },
          answerUrl: submission.answerUrl,
          submittedAt: submission.submittedAt,
          status: submission.status
        }))
      }
    });

  } catch (error) {
    console.error('Get all submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submissions'
    });
  }
});

module.exports = router;
