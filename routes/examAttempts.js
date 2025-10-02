const express = require('express');
const { body, validationResult } = require('express-validator');
const ExamAttempt = require('../models/ExamAttempt');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const { verifyToken, isStudent } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/exam-attempts/start
// @desc    Start an exam attempt
// @access  Private (Student)
router.post('/start', verifyToken, isStudent, [
  body('examId').isMongoId().withMessage('Valid exam ID is required')
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

    const { examId } = req.body;
    const studentId = req.user.id;

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
      studentId: studentId,
      examId: examId
    });

    if (existingSubmission) {
      return res.status(400).json({
        success: false,
        message: 'You have already attempted this exam. You cannot attempt it twice.'
      });
    }

    // Check if attempt already exists
    let attempt = await ExamAttempt.findOne({
      studentId: studentId,
      examId: examId
    });

    if (attempt) {
      if (attempt.isCompleted) {
        return res.status(400).json({
          success: false,
          message: 'You have already completed this exam.'
        });
      }
      
      // Resume existing attempt
      attempt.lastAccessedAt = new Date();
      attempt.status = 'started';
      await attempt.save();
    } else {
      // Create new attempt
      attempt = new ExamAttempt({
        studentId: studentId,
        examId: examId,
        timeRemaining: exam.duration * 60, // Convert minutes to seconds
        status: 'started'
      });
      await attempt.save();
    }

    res.json({
      success: true,
      data: {
        attempt: {
          id: attempt._id,
          examId: attempt.examId,
          timeRemaining: attempt.timeRemaining,
          status: attempt.status,
          startedAt: attempt.startedAt,
          lastAccessedAt: attempt.lastAccessedAt
        }
      }
    });

  } catch (error) {
    console.error('Start exam attempt error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during exam attempt start'
    });
  }
});

// @route   GET /api/exam-attempts/:examId
// @desc    Get exam attempt for a specific exam
// @access  Private (Student)
router.get('/:examId', verifyToken, isStudent, async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.id;

    const attempt = await ExamAttempt.findOne({
      studentId: studentId,
      examId: examId
    });

    if (!attempt) {
      return res.json({
        success: true,
        data: {
          attempt: null
        }
      });
    }

    // Check if attempt has expired
    const now = new Date();
    const timeElapsed = Math.floor((now - attempt.startedAt) / 1000);
    const remainingTime = Math.max(0, attempt.timeRemaining - timeElapsed);

    if (remainingTime <= 0 && attempt.status !== 'completed') {
      attempt.status = 'expired';
      attempt.timeRemaining = 0;
      await attempt.save();
    }

    res.json({
      success: true,
      data: {
        attempt: {
          id: attempt._id,
          examId: attempt.examId,
          timeRemaining: remainingTime,
          status: attempt.status,
          startedAt: attempt.startedAt,
          lastAccessedAt: attempt.lastAccessedAt,
          isCompleted: attempt.isCompleted
        }
      }
    });

  } catch (error) {
    console.error('Get exam attempt error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching exam attempt'
    });
  }
});

// @route   PUT /api/exam-attempts/:attemptId/time
// @desc    Update remaining time for an attempt
// @access  Private (Student)
router.put('/:attemptId/time', verifyToken, isStudent, [
  body('timeRemaining').isNumeric().withMessage('Valid time remaining is required')
], async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { timeRemaining } = req.body;
    const studentId = req.user.id;

    const attempt = await ExamAttempt.findOne({
      _id: attemptId,
      studentId: studentId
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Exam attempt not found'
      });
    }

    attempt.timeRemaining = Math.max(0, timeRemaining);
    attempt.lastAccessedAt = new Date();
    
    if (attempt.timeRemaining <= 0) {
      attempt.status = 'expired';
    }
    
    await attempt.save();

    res.json({
      success: true,
      data: {
        attempt: {
          id: attempt._id,
          timeRemaining: attempt.timeRemaining,
          status: attempt.status
        }
      }
    });

  } catch (error) {
    console.error('Update exam attempt time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating exam attempt time'
    });
  }
});

// @route   PUT /api/exam-attempts/:attemptId/complete
// @desc    Mark exam attempt as completed
// @access  Private (Student)
router.put('/:attemptId/complete', verifyToken, isStudent, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user.id;

    const attempt = await ExamAttempt.findOne({
      _id: attemptId,
      studentId: studentId
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Exam attempt not found'
      });
    }

    attempt.status = 'completed';
    attempt.isCompleted = true;
    await attempt.save();

    res.json({
      success: true,
      message: 'Exam attempt marked as completed'
    });

  } catch (error) {
    console.error('Complete exam attempt error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while completing exam attempt'
    });
  }
});

module.exports = router;
