require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const EvaluationCriteria = require('../models/EvaluationCriteria');

const seedCriteria = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Clear existing criteria
    await EvaluationCriteria.deleteMany();
    console.log('✓ Cleared existing criteria');

    const criteria = [
      // 1. Teaching Methodology
      {
        name: 'Clarity of Presentation',
        description: 'How well the lecturer uses slides or visual aids',
        category: 'Teaching Methodology',
        order: 1,
      },
      {
        name: 'Real-life Application',
        description: 'Skill in relating theory to practical, real-world situations',
        category: 'Teaching Methodology',
        order: 2,
      },
      {
        name: 'Syllabus Clarity',
        description: 'How well the objectives and grading criteria were defined at the start',
        category: 'Teaching Methodology',
        order: 3,
      },
      {
        name: 'Interest Generation',
        description: 'Whether the lecturer made the subject matter engaging',
        category: 'Teaching Methodology',
        order: 4,
      },
      {
        name: 'Mastery of Topics',
        description: 'The lecturer\'s depth of knowledge in the subject area',
        category: 'Teaching Methodology',
        order: 5,
      },
      {
        name: 'Tutorials',
        description: 'The adequacy and effectiveness of tutorial hours',
        category: 'Teaching Methodology',
        order: 6,
      },

      // 2. Teacher's Assessment Procedure
      {
        name: 'Transparency',
        description: 'Clarity of assessment criteria',
        category: 'Teacher\'s Assessment Procedure',
        order: 7,
      },
      {
        name: 'Fairness',
        description: 'Whether the questions and scoring methods were unbiased',
        category: 'Teacher\'s Assessment Procedure',
        order: 8,
      },
      {
        name: 'Promptness',
        description: 'How quickly assignments and exams were returned to you',
        category: 'Teacher\'s Assessment Procedure',
        order: 9,
      },
      {
        name: 'Feedback Quality',
        description: 'How useful the lecturer\'s comments were in helping you correct errors',
        category: 'Teacher\'s Assessment Procedure',
        order: 10,
      },
      {
        name: 'Continuous Assessment',
        description: 'The effectiveness of using quizzes and projects as part of the total grade',
        category: 'Teacher\'s Assessment Procedure',
        order: 11,
      },

      // 3. Classroom Management
      {
        name: 'Interpersonal Respect',
        description: 'The teacher\'s respect for students as individuals',
        category: 'Classroom Management',
        order: 12,
      },
      {
        name: 'Class Control',
        description: 'How well the lecturer manages the classroom environment',
        category: 'Classroom Management',
        order: 13,
      },
      {
        name: 'Availability',
        description: 'Response rates for online consultations and discussions',
        category: 'Classroom Management',
        order: 14,
      },
      {
        name: 'Attendance Tracking',
        description: 'The accuracy and consistency of student attendance records',
        category: 'Classroom Management',
        order: 15,
      },

      // 4. Integration of Faith and Values
      {
        name: 'Spiritual Engagement',
        description: 'Whether the teacher prays with students in class',
        category: 'Integration of Faith and Values',
        order: 16,
      },
      {
        name: 'Curriculum Connection',
        description: 'How well biblical values are connected to course content and assignments',
        category: 'Integration of Faith and Values',
        order: 17,
      },
      {
        name: 'Personal Integrity',
        description: 'The teacher\'s demonstration of integrity in their speech and conduct',
        category: 'Integration of Faith and Values',
        order: 18,
      },
      {
        name: 'Life Reflection',
        description: 'Guiding students to reflect on life\'s meaning through the course material',
        category: 'Integration of Faith and Values',
        order: 19,
      },
      {
        name: 'Institutional Alignment',
        description: 'Connecting the course objectives with the university\'s mission, vision, and core values',
        category: 'Integration of Faith and Values',
        order: 20,
      },

      // 5. Attendance and Punctuality
      {
        name: 'Teacher\'s Attendance',
        description: 'How often the lecturer actually showed up for scheduled classes',
        category: 'Attendance and Punctuality',
        order: 21,
      },
      {
        name: 'Teacher\'s Punctuality',
        description: 'Whether the lecturer arrived on time for those classes',
        category: 'Attendance and Punctuality',
        order: 22,
      },

      // 6. Open-Ended Assessments (these are for qualitative feedback, not scored)
      {
        name: 'Likes',
        description: 'Specific experiences or aspects of the course that were positive or helpful for your learning',
        category: 'Open-Ended Assessment',
        order: 23,
      },
      {
        name: 'Dislikes',
        description: 'Areas where you felt the course or the lecturer\'s approach fell short',
        category: 'Open-Ended Assessment',
        order: 24,
      },
    ];

    await EvaluationCriteria.insertMany(criteria);
    console.log(`✓ Seeded ${criteria.length} evaluation criteria for Babcock University`);

    // Display summary
    const grouped = {};
    criteria.forEach(c => {
      if (!grouped[c.category]) grouped[c.category] = [];
      grouped[c.category].push(c.name);
    });

    console.log('\n━━━ Summary by Category ━━━');
    Object.entries(grouped).forEach(([cat, items]) => {
      console.log(`\n${cat} (${items.length} items):`);
      items.forEach(name => console.log(`  • ${name}`));
    });

    console.log('\n✓ All criteria seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('✗ Seeding failed:', err.message);
    process.exit(1);
  }
};

seedCriteria();
