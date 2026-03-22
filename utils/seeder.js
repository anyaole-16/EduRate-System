require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const EvaluationCriteria = require('../models/EvaluationCriteria');
const EvaluationPeriod = require('../models/EvaluationPeriod');
const Evaluation = require('../models/Evaluation');
const crypto = require('crypto');

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB for seeding...');

  // Clear
  await Promise.all([User.deleteMany(), Course.deleteMany(), EvaluationCriteria.deleteMany(), EvaluationPeriod.deleteMany(), Evaluation.deleteMany()]);
  console.log('Cleared existing data');

  // Admin
  const admin = await User.create({ fullName: 'System Administrator', email: 'admin@university.edu', password: 'Admin@1234', role: 'admin', department: 'Administration', school: 'University' });

  // Lecturers
  const [lec1, lec2] = await User.create([
    { fullName: 'Dr. Emeka Okafor', email: 'e.okafor@university.edu', password: 'Lecturer@1234', role: 'lecturer', department: 'Computer Science', school: 'Engineering' },
    { fullName: 'Prof. Amaka Nwosu', email: 'a.nwosu@university.edu', password: 'Lecturer@1234', role: 'lecturer', department: 'Mathematics', school: 'Science' },
  ]);

  // Students
  const students = await User.create([
    { fullName: 'Chidi Eze', email: 'chidi.eze@student.university.edu', password: 'Student@1234', role: 'student', department: 'Computer Science', school: 'Engineering', matricNumber: 'CSC/2021/001', level: 100 },
    { fullName: 'Ngozi Adeyemi', email: 'ngozi.adeyemi@student.university.edu', password: 'Student@1234', role: 'student', department: 'Computer Science', school: 'Engineering', matricNumber: 'CSC/2021/002', level: 100 },
    { fullName: 'Tunde Babatunde', email: 'tunde.b@student.university.edu', password: 'Student@1234', role: 'student', department: 'Mathematics', school: 'Science', matricNumber: 'MTH/2021/001', level: 100 },
  ]);

  // Criteria
  const criteriaData = [
    { name: 'Punctuality', description: 'Lecturer arrives on time and ends class as scheduled', category: 'Professionalism', order: 1 },
    { name: 'Clarity of Explanation', description: 'Concepts are explained clearly and understandably', category: 'Teaching', order: 2 },
    { name: 'Communication Skills', description: 'Effective verbal and non-verbal communication', category: 'Teaching', order: 3 },
    { name: 'Course Content Coverage', description: 'Adequately covers the course syllabus', category: 'Academic', order: 4 },
    { name: 'Student Engagement', description: 'Encourages student participation and interaction', category: 'Teaching', order: 5 },
    { name: 'Availability & Accessibility', description: 'Available for consultation outside class hours', category: 'Professionalism', order: 6 },
    { name: 'Assessment Fairness', description: 'Assignments and grading are fair and transparent', category: 'Academic', order: 7 },
  ];
  const criteria = await EvaluationCriteria.insertMany(criteriaData.map(c => ({ ...c, createdBy: admin._id })));

  // Courses
  const [csc101, csc202, mth101] = await Course.create([
    { code: 'CSC101', title: 'Introduction to Programming', department: 'Computer Science', school: 'Engineering', lecturer: lec1._id, semester: 'First', academicYear: '2023/2024', enrolledStudents: [students[0]._id, students[1]._id] },
    { code: 'CSC202', title: 'Data Structures and Algorithms', department: 'Computer Science', school: 'Engineering', lecturer: lec1._id, semester: 'First', academicYear: '2023/2024', enrolledStudents: [students[0]._id] },
    { code: 'MTH101', title: 'Calculus I', department: 'Mathematics', school: 'Science', lecturer: lec2._id, semester: 'First', academicYear: '2023/2024', enrolledStudents: [students[1]._id, students[2]._id] },
  ]);

  // Update lecturer courses
  await User.findByIdAndUpdate(lec1._id, { courses: [csc101._id, csc202._id] });
  await User.findByIdAndUpdate(lec2._id, { courses: [mth101._id] });
  // Update student enrolled courses
  await User.findByIdAndUpdate(students[0]._id, { enrolledCourses: [csc101._id, csc202._id] });
  await User.findByIdAndUpdate(students[1]._id, { enrolledCourses: [csc101._id, mth101._id] });
  await User.findByIdAndUpdate(students[2]._id, { enrolledCourses: [mth101._id] });

  // Evaluation Period (active now)
  const now = new Date();
  const period = await EvaluationPeriod.create({
    title: 'First Semester 2023/2024 Evaluation',
    semester: 'First',
    academicYear: '2023/2024',
    startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    isActive: true,
    courses: [csc101._id, csc202._id, mth101._id],
    createdBy: admin._id,
  });

  // Sample evaluations (anonymous)
  const sampleEvals = [
    { student: students[0]._id, course: csc101._id, lecturer: lec1._id, scores: [5, 4, 5, 4, 5, 3, 4], feedback: 'Excellent teaching style!' },
    { student: students[1]._id, course: csc101._id, lecturer: lec1._id, scores: [4, 5, 4, 5, 4, 4, 5], feedback: 'Very engaging and approachable.' },
    { student: students[0]._id, course: csc202._id, lecturer: lec1._id, scores: [3, 4, 3, 4, 3, 4, 3], feedback: 'Could improve on coverage.' },
    { student: students[1]._id, course: mth101._id, lecturer: lec2._id, scores: [5, 5, 4, 5, 4, 5, 5], feedback: 'Prof Nwosu is incredible!' },
    { student: students[2]._id, course: mth101._id, lecturer: lec2._id, scores: [4, 4, 5, 4, 5, 4, 4], feedback: '' },
  ];

  for (const e of sampleEvals) {
    const token = crypto.createHash('sha256').update(`${e.student}-${e.course}-${period._id}`).digest('hex');
    await Evaluation.create({
      course: e.course,
      lecturer: e.lecturer,
      evaluationPeriod: period._id,
      semester: period.semester,
      academicYear: period.academicYear,
      ratings: criteria.map((c, i) => ({ criteria: c._id, criteriaName: c.name, score: e.scores[i] || 3 })),
      feedback: e.feedback,
      submissionToken: token,
    });
  }

  console.log('✅ Seed complete!');
  console.log('\n📋 Login Credentials:');
  console.log('  Admin:    admin@university.edu / Admin@1234');
  console.log('  Lecturer: e.okafor@university.edu / Lecturer@1234');
  console.log('  Lecturer: a.nwosu@university.edu / Lecturer@1234');
  console.log('  Student:  chidi.eze@student.university.edu / Student@1234');
  console.log('  Student:  ngozi.adeyemi@student.university.edu / Student@1234');
  await mongoose.disconnect();
};

seed().catch(err => { console.error(err); process.exit(1); });