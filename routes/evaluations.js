const express = require('express');
const router = express.Router();
const Evaluation = require('../models/Evaluation');
const StudentSubmission = require('../models/StudentSubmission');
const EvaluationResult = require('../models/EvaluationResult');

// ==========================================
// 1. EVALUATION PLANS & TEST SERIES ROUTES
// ==========================================

// @route   GET /api/evaluations
// @desc    Get all active/published evaluations (or all if query admin=true)
router.get('/', async (req, res) => {
  try {
    const { category, admin } = req.query;
    let filter = {};
    if (admin !== 'true') {
      filter.published = true;
    }
    if (category && category !== 'All') {
      filter.category = category;
    }
    const list = await Evaluation.find(filter).sort({ order: 1, createdAt: -1 });
    return res.json(list);
  } catch (err) {
    console.error('Error fetching evaluations:', err);
    return res.status(500).json({ message: 'Server error fetching evaluation plans' });
  }
});

// @route   GET /api/evaluations/submissions
// @desc    Get student answer sheet submissions (filtered by studentEmail if provided)
router.get('/submissions', async (req, res) => {
  try {
    const { email } = req.query;
    let filter = {};
    if (email) {
      filter.studentEmail = email.toLowerCase();
    }
    const list = await StudentSubmission.find(filter).sort({ createdAt: -1 });
    return res.json(list);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    return res.status(500).json({ message: 'Server error fetching submissions' });
  }
});

// @route   POST /api/evaluations/submissions
// @desc    Create or update student answer sheet submission
router.post('/submissions', async (req, res) => {
  try {
    const { planId, planTitle, testId, testName, studentName, studentEmail, fileName, fileSize, fileUrl } = req.body;
    
    if (!planId || !testId || !studentEmail) {
      return res.status(400).json({ message: 'planId, testId, and studentEmail are required' });
    }

    const emailClean = studentEmail.toLowerCase();
    
    let existing = await StudentSubmission.findOne({ planId, testId, studentEmail: emailClean });
    if (existing) {
      existing.fileName = fileName || existing.fileName;
      existing.fileSize = fileSize || existing.fileSize;
      existing.fileUrl = fileUrl || existing.fileUrl;
      existing.uploadedAt = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      existing.status = 'Under Evaluation';
      const updated = await existing.save();
      return res.json(updated);
    }

    const newSub = new StudentSubmission({
      planId,
      planTitle,
      testId,
      testName,
      studentName,
      studentEmail: emailClean,
      fileName,
      fileSize: fileSize || '',
      fileUrl,
      status: 'Under Evaluation'
    });

    const saved = await newSub.save();
    return res.status(201).json(saved);
  } catch (err) {
    console.error('Error saving student submission:', err);
    return res.status(500).json({ message: 'Server error saving submission' });
  }
});

// @route   GET /api/evaluations/results
// @desc    Get evaluation results (filtered by studentEmail or 'all' for course model results)
router.get('/results', async (req, res) => {
  try {
    const { email } = req.query;
    let filter = {};
    if (email) {
      const emailClean = email.toLowerCase();
      filter.$or = [
        { studentEmail: emailClean },
        { studentEmail: 'all' },
        { studentEmail: 'all_students' }
      ];
    }
    const list = await EvaluationResult.find(filter).sort({ createdAt: -1 });
    return res.json(list);
  } catch (err) {
    console.error('Error fetching evaluation results:', err);
    return res.status(500).json({ message: 'Server error fetching results' });
  }
});

// @route   POST /api/evaluations/results
// @desc    Create/publish new evaluation result PDF (checked copy or model result)
router.post('/results', async (req, res) => {
  try {
    const { planTitle, testName, paperTag, studentEmail, targetType, score, remarks, resultPdf } = req.body;
    
    if (!planTitle || !resultPdf) {
      return res.status(400).json({ message: 'planTitle and resultPdf are required' });
    }

    const newRes = new EvaluationResult({
      planTitle,
      testName: testName || '',
      paperTag: paperTag || '',
      studentEmail: (studentEmail || 'all').toLowerCase(),
      targetType: targetType || 'personal',
      score: score || '',
      remarks: remarks || '',
      resultPdf
    });

    const saved = await newRes.save();

    // Also update student submission status to Checked / Evaluated if applicable
    if (studentEmail && studentEmail !== 'all') {
      await StudentSubmission.updateMany(
        { studentEmail: studentEmail.toLowerCase() },
        { $set: { status: 'Checked / Evaluated' } }
      );
    }

    return res.status(201).json(saved);
  } catch (err) {
    console.error('Error publishing evaluation result:', err);
    return res.status(500).json({ message: 'Server error publishing result' });
  }
});

// @route   DELETE /api/evaluations/results/:id
// @desc    Delete evaluation result PDF
router.delete('/results/:id', async (req, res) => {
  try {
    const item = await EvaluationResult.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Result not found' });
    }
    await item.deleteOne();
    return res.json({ message: 'Result deleted successfully' });
  } catch (err) {
    console.error('Error deleting result:', err);
    return res.status(500).json({ message: 'Server error deleting result' });
  }
});

// @route   GET /api/evaluations/:id
// @desc    Get single evaluation plan by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await Evaluation.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Evaluation plan not found' });
    }
    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/evaluations
// @desc    Create new evaluation plan
router.post('/', async (req, res) => {
  try {
    const { title, category, paperTag, description, features, mrpPrice, finalPrice, duration, badge, purchaseUrl, planPdf, planPdfTitle, isDayWiseSchedule, totalDays, tests, published, order } = req.body;
    
    const newItem = new Evaluation({
      title,
      category: category || 'GS',
      paperTag: paperTag || '',
      description: description || '',
      features: Array.isArray(features) ? features : (features ? features.split('\n').filter(f => f.trim()) : []),
      mrpPrice: parseFloat(mrpPrice || 0),
      finalPrice: parseFloat(finalPrice || 0),
      duration: duration || '3 Months',
      badge: badge || '',
      purchaseUrl: purchaseUrl || '/#contact',
      planPdf: planPdf || '',
      planPdfTitle: planPdfTitle || 'Program Syllabus & Micro-Topics Overview PDF',
      isDayWiseSchedule: !!isDayWiseSchedule,
      totalDays: parseInt(totalDays || 30),
      tests: Array.isArray(tests) ? tests : [],
      published: published !== undefined ? published : true,
      order: parseInt(order || 0)
    });

    const saved = await newItem.save();
    return res.status(201).json(saved);
  } catch (err) {
    console.error('Error creating evaluation plan:', err);
    return res.status(500).json({ message: 'Server error creating evaluation plan' });
  }
});

// @route   PUT /api/evaluations/:id
// @desc    Update evaluation plan
router.put('/:id', async (req, res) => {
  try {
    const item = await Evaluation.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Evaluation plan not found' });
    }

    const { title, category, paperTag, description, features, mrpPrice, finalPrice, duration, badge, purchaseUrl, planPdf, planPdfTitle, isDayWiseSchedule, totalDays, tests, published, order } = req.body;

    if (title !== undefined) item.title = title;
    if (category !== undefined) item.category = category;
    if (paperTag !== undefined) item.paperTag = paperTag;
    if (description !== undefined) item.description = description;
    if (features !== undefined) {
      item.features = Array.isArray(features) ? features : features.split('\n').filter(f => f.trim());
    }
    if (mrpPrice !== undefined) item.mrpPrice = parseFloat(mrpPrice || 0);
    if (finalPrice !== undefined) item.finalPrice = parseFloat(finalPrice || 0);
    if (duration !== undefined) item.duration = duration;
    if (badge !== undefined) item.badge = badge;
    if (purchaseUrl !== undefined) item.purchaseUrl = purchaseUrl;
    if (planPdf !== undefined) item.planPdf = planPdf;
    if (planPdfTitle !== undefined) item.planPdfTitle = planPdfTitle;
    if (isDayWiseSchedule !== undefined) item.isDayWiseSchedule = !!isDayWiseSchedule;
    if (totalDays !== undefined) item.totalDays = parseInt(totalDays || 30);
    if (tests !== undefined && Array.isArray(tests)) item.tests = tests;
    if (published !== undefined) item.published = published;
    if (order !== undefined) item.order = parseInt(order || 0);

    const updated = await item.save();
    return res.json(updated);
  } catch (err) {
    console.error('Error updating evaluation plan:', err);
    return res.status(500).json({ message: 'Server error updating evaluation plan' });
  }
});

// @route   DELETE /api/evaluations/:id
// @desc    Delete evaluation plan
router.delete('/:id', async (req, res) => {
  try {
    const item = await Evaluation.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Evaluation plan not found' });
    }
    await item.deleteOne();
    return res.json({ message: 'Evaluation plan deleted successfully' });
  } catch (err) {
    console.error('Error deleting evaluation plan:', err);
    return res.status(500).json({ message: 'Server error deleting evaluation plan' });
  }
});

module.exports = router;
