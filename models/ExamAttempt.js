const mongoose = require('mongoose');

const examAttemptSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student_user',
    required: [true, 'Student ID is required']
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exams',
    required: [true, 'Exam ID is required']
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
  timeRemaining: {
    type: Number, // in seconds
    required: true
  },
  status: {
    type: String,
    enum: ['started', 'paused', 'completed', 'expired'],
    default: 'started'
  },
  isCompleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for better query performance
examAttemptSchema.index({ studentId: 1, examId: 1 }, { unique: true });
examAttemptSchema.index({ studentId: 1, status: 1 });

module.exports = mongoose.model('ExamAttempt', examAttemptSchema);
