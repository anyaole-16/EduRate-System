const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');
const Evaluation = require('../models/Evaluation');
const User = require('../models/User');
const Course = require('../models/Course');

const computeStats = (scores) => {
  if (!scores.length) return { mean: 0, median: 0, mode: 0, count: 0 };
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);
  const freq = {};
  scores.forEach(s => freq[s] = (freq[s] || 0) + 1);
  const mode = +Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
  return { mean, median, mode, count: scores.length };
};

exports.exportCSV = async (req, res) => {
  try {
    const { lecturerId, semester, academicYear } = req.query;
    const filter = {};
    if (lecturerId) filter.lecturer = lecturerId;
    if (semester) filter.semester = semester;
    if (academicYear) filter.academicYear = academicYear;

    const evaluations = await Evaluation.find(filter)
      .populate('course', 'code title department')
      .populate('lecturer', 'fullName department');

    const rows = [];
    evaluations.forEach(ev => {
      ev.ratings.forEach(r => {
        rows.push({
          lecturer: ev.lecturer?.fullName || 'N/A',
          department: ev.lecturer?.department || 'N/A',
          course: ev.course?.code || 'N/A',
          courseTitle: ev.course?.title || 'N/A',
          semester: ev.semester,
          academicYear: ev.academicYear,
          criteria: r.criteriaName,
          score: r.score,
          submittedAt: ev.submittedAt?.toISOString()?.split('T')[0],
        });
      });
    });

    const tmpPath = path.join('/tmp', `evaltrack_${Date.now()}.csv`);
    const csvWriter = createObjectCsvWriter({
      path: tmpPath,
      header: [
        { id: 'lecturer', title: 'Lecturer' },
        { id: 'department', title: 'Department' },
        { id: 'course', title: 'Course Code' },
        { id: 'courseTitle', title: 'Course Title' },
        { id: 'semester', title: 'Semester' },
        { id: 'academicYear', title: 'Academic Year' },
        { id: 'criteria', title: 'Criteria' },
        { id: 'score', title: 'Score (1-5)' },
        { id: 'submittedAt', title: 'Date Submitted' },
      ]
    });

    await csvWriter.writeRecords(rows);
    res.download(tmpPath, 'evaltrack_report.csv', () => fs.unlinkSync(tmpPath));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportPDF = async (req, res) => {
  try {
    const { lecturerId, semester, academicYear } = req.query;
    const filter = {};
    if (lecturerId) filter.lecturer = lecturerId;
    if (semester) filter.semester = semester;
    if (academicYear) filter.academicYear = academicYear;

    const evaluations = await Evaluation.find(filter).populate('course', 'code title').populate('lecturer', 'fullName department');

    // Group by lecturer
    const byLecturer = {};
    evaluations.forEach(ev => {
      const lid = ev.lecturer?._id?.toString();
      if (!lid) return;
      if (!byLecturer[lid]) byLecturer[lid] = { name: ev.lecturer.fullName, dept: ev.lecturer.department, evals: [] };
      byLecturer[lid].evals.push(ev);
    });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=evaltrack_report.pdf');
    doc.pipe(res);

    // Cover page
    doc.fontSize(24).font('Helvetica-Bold').text('EvalTrack', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text('Lecturer Evaluation Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`Generated: ${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}`, { align: 'center' });
    if (semester) doc.text(`Semester: ${semester}`, { align: 'center' });
    if (academicYear) doc.text(`Academic Year: ${academicYear}`, { align: 'center' });
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(2);

    for (const [, lecturer] of Object.entries(byLecturer)) {
      doc.fontSize(14).font('Helvetica-Bold').text(lecturer.name);
      doc.fontSize(10).font('Helvetica').text(`Department: ${lecturer.dept}`);
      doc.moveDown(0.5);

      // Aggregate criteria stats
      const criteriaAgg = {};
      lecturer.evals.forEach(ev => {
        ev.ratings.forEach(r => {
          if (!criteriaAgg[r.criteriaName]) criteriaAgg[r.criteriaName] = [];
          criteriaAgg[r.criteriaName].push(r.score);
        });
      });

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Criteria', 50, doc.y, { continued: true, width: 200 });
      doc.text('Mean', 250, doc.y, { continued: true, width: 60 });
      doc.text('Median', 310, doc.y, { continued: true, width: 60 });
      doc.text('Mode', 370, doc.y, { continued: true, width: 60 });
      doc.text('Responses', 430, doc.y, { width: 80 });
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font('Helvetica');
      for (const [crit, scores] of Object.entries(criteriaAgg)) {
        const stats = computeStats(scores);
        const y = doc.y;
        doc.text(crit, 50, y, { continued: true, width: 200 });
        doc.text(String(stats.mean), 250, y, { continued: true, width: 60 });
        doc.text(String(stats.median), 310, y, { continued: true, width: 60 });
        doc.text(String(stats.mode), 370, y, { continued: true, width: 60 });
        doc.text(String(stats.count), 430, y, { width: 80 });
      }

      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).dash(3, { space: 3 }).stroke();
      doc.undash();
      doc.moveDown(1);

      if (doc.y > 700) doc.addPage();
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};