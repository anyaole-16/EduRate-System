const mongoose = require('mongoose');

const evaluationPeriodSchema = new mongoose.Schema({
  title: { type: String, required: true },
  semester: { type: String, enum: ['First', 'Second'], required: true },
  academicYear: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

evaluationPeriodSchema.virtual('isOpen').get(function() {
  const now = new Date();
  return this.isActive && now >= this.startDate && now <= this.endDate;
});

module.exports = mongoose.model('EvaluationPeriod', evaluationPeriodSchema);