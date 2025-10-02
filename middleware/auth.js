const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');

// Verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No token provided.' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token.' 
    });
  }
};

// Check if user is teacher
const isTeacher = async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Teacher role required.' 
      });
    }
    
    // Verify teacher exists
    const teacher = await Teacher.findById(req.user.id);
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: 'Teacher not found.' 
      });
    }
    
    req.teacher = teacher;
    next();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error during teacher verification.' 
    });
  }
};

// Check if user is student
const isStudent = async (req, res, next) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Student role required.' 
      });
    }
    
    // Verify student exists
    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found.' 
      });
    }
    
    req.student = student;
    next();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error during student verification.' 
    });
  }
};

// Check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin role required.' 
      });
    }
    
    // Verify admin exists
    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ 
        success: false, 
        message: 'Admin not found.' 
      });
    }
    
    req.admin = admin;
    next();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error during admin verification.' 
    });
  }
};

module.exports = {
  verifyToken,
  isTeacher,
  isStudent,
  isAdmin
};
