const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Exam title is required'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  examFileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Exam file ID is required']
  },
  duration: {
    type: Number,
    required: [true, 'Exam duration is required'],
    min: [1, 'Duration must be at least 1 minute'],
    max: [300, 'Duration cannot exceed 300 minutes']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher_user',
    required: [true, 'Created by field is required']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
examSchema.index({ createdBy: 1, createdAt: -1 });
examSchema.index({ isActive: 1 });

module.exports = mongoose.model('Exams', examSchema);
