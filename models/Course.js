const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true },
  title: { type: String, required: true, trim: true },
  department: { type: String, required: true },
  school: { type: String, required: true },
  lecturer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  semester: { type: String, enum: ['First', 'Second'], required: true },
  academicYear: { type: String, required: true }, // e.g. "2023/2024"
  enrolledStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

courseSchema.index({ code: 1, academicYear: 1, semester: 1 }, { unique: true });

module.exports = mongoose.model('Course', courseSchema);