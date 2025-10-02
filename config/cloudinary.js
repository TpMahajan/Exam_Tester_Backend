const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload function for exam files (PDFs and Images)
const uploadExamFile = async (file) => {
  try {
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    const isPdf = fileExtension === 'pdf';
    
    const uploadOptions = {
      folder: 'exam-tester/exams',
      public_id: `exam_${Date.now()}`,
      type: 'upload',
      access_mode: 'public',
      use_filename: false,
      unique_filename: true,
      overwrite: true,
      invalidate: true
    };

    if (isPdf) {
      // Handle PDF files - use 'image' resource type with PDF format for browser compatibility
      uploadOptions.resource_type = 'image';
      uploadOptions.format = 'pdf';
      uploadOptions.transformation = [
        {
          fetch_format: 'pdf',
          quality: 'auto'
        }
      ];
    } else {
      // Handle image files
      uploadOptions.resource_type = 'image';
      uploadOptions.transformation = [
        {
          quality: 'auto',
          fetch_format: 'auto'
        }
      ];
    }

    const result = await cloudinary.uploader.upload(file.path, uploadOptions);
    
    return result.secure_url;
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

// Upload function for answer files (PDFs/Images)
const uploadAnswerFile = async (file) => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'exam-tester/answers',
      public_id: `answer_${Date.now()}`,
      resource_type: 'auto', // Auto-detect file type
      type: 'upload',
      access_mode: 'public',
      use_filename: true,
      unique_filename: false
    });
    return result.secure_url;
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

module.exports = {
  uploadExamFile,
  uploadAnswerFile
};
