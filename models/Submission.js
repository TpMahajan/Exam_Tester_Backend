const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
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
  answerUrl: {
    type: String,
    required: [true, 'Answer URL is required'],
    trim: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['submitted', 'graded', 'late'],
    default: 'submitted'
  }
}, {
  timestamps: true
});

// Index for better query performance
submissionSchema.index({ studentId: 1, examId: 1 });
submissionSchema.index({ examId: 1, submittedAt: -1 });

// Ensure one submission per student per exam
submissionSchema.index({ studentId: 1, examId: 1 }, { unique: true });

module.exports = mongoose.model('Submissions', submissionSchema);
