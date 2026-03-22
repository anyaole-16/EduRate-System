const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  criteria: { type: mongoose.Schema.Types.ObjectId, ref: 'EvaluationCriteria', required: true },
  criteriaName: { type: String, required: true }, // snapshot at time of submission
  score: { type: Number, required: true, min: 1, max: 5 },
}, { _id: false });

const evaluationSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lecturer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  evaluationPeriod: { type: mongoose.Schema.Types.ObjectId, ref: 'EvaluationPeriod', required: true },
  semester: { type: String },
  academicYear: { type: String },
  ratings: [ratingSchema],
  feedback: { type: String, trim: true, maxlength: 1000 },
  // Anonymization: store a hashed token (sha256 of studentId+courseId+periodId), NOT the student ID
  submissionToken: { type: String, required: true, unique: true },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });

evaluationSchema.index({ course: 1, evaluationPeriod: 1 });
evaluationSchema.index({ lecturer: 1, evaluationPeriod: 1 });

module.exports = mongoose.model('Evaluation', evaluationSchema);