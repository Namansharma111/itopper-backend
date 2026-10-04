const express = require('express');
const router = express.Router();
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const PaymentTransaction = require('../models/PaymentTransaction');

// @route   GET /api/enrollments/all
// @desc    Get all enrollments (Admin view)
router.get('/all', async (req, res) => {
  try {
    const enrollments = await Enrollment.find().sort({ createdAt: -1 });
    return res.json(enrollments);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/enrollments/user-purchases
// @desc    Get student's active enrollments by email or studentId (No auth middleware required for email lookup)
router.get('/user-purchases', async (req, res) => {
  try {
    const { email, studentId } = req.query;
    if (!email && !studentId) {
      return res.json({ enrollments: [], transactions: [] });
    }

    const orConditions = [];
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      orConditions.push({ studentEmail: cleanEmail });
      orConditions.push({ studentEmail: new RegExp('^' + cleanEmail + '$', 'i') });
    }
    if (studentId) {
      orConditions.push({ studentId: studentId });
    }

    const filter = { $or: orConditions };

    const enrollments = await Enrollment.find(filter).sort({ createdAt: -1 });

    // Also check PaymentTransaction for verified purchases
    const txns = await PaymentTransaction.find({
      $or: [
        { studentEmail: email ? email.trim().toLowerCase() : '' },
        { studentId: studentId || '' }
      ],
      status: { $in: ['VERIFIED', 'PAID', 'SUCCESS', 'CREATED'] }
    }).sort({ createdAt: -1 });

    return res.json({ enrollments, transactions: txns });
  } catch (err) {
    console.error('Error fetching user purchases:', err);
    return res.status(500).json({ message: 'Server error fetching user purchases' });
  }
});

// @route   GET /api/enrollments
// @desc    Get student's active enrollments
router.get('/', protect, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ studentId: req.user._id });
    return res.json(enrollments);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error fetching enrollments' });
  }
});

// @route   POST /api/enrollments
// @desc    Enroll in a course
router.post('/', protect, async (req, res) => {
  const { courseId, pricePaid, paymentId } = req.body;
  try {
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if already enrolled
    const existing = await Enrollment.findOne({ studentId: req.user._id, courseId });
    if (existing) {
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }

    const enrollment = new Enrollment({
      studentId: req.user._id,
      studentName: req.user.name || 'Student',
      studentEmail: req.user.email,
      courseId: course._id,
      courseName: course.subject,
      pricePaid: parseFloat(pricePaid || 0),
      paymentId: paymentId || '',
      status: 'Active'
    });

    await enrollment.save();
    return res.status(201).json(enrollment);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error enrolling in course' });
  }
});

// @route   DELETE /api/enrollments/:id
// @desc    Delete/Cancel an enrollment
router.delete('/:id', async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }
    await enrollment.deleteOne();
    return res.json({ message: 'Enrollment removed successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error deleting enrollment' });
  }
});

module.exports = router;
