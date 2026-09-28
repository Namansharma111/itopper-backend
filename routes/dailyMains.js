const express = require('express');
const router = express.Router();
const DailyMains = require('../models/DailyMains');

// @route   GET /api/daily-mains
// @desc    Get all active/published Daily Mains packages (or all if query admin=true)
router.get('/', async (req, res) => {
  try {
    const { admin } = req.query;
    let filter = {};
    if (admin !== 'true') {
      filter.published = true;
    }
    const list = await DailyMains.find(filter).sort({ order: 1, createdAt: -1 });
    return res.json(list);
  } catch (err) {
    console.error('Error fetching Daily Mains packages:', err);
    return res.status(500).json({ message: 'Server error fetching Daily Mains packages' });
  }
});

// @route   GET /api/daily-mains/:id
// @desc    Get single Daily Mains package by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await DailyMains.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Daily Mains package not found' });
    }
    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/daily-mains
// @desc    Create new Daily Mains package
router.post('/', async (req, res) => {
  try {
    const { title, category, paperTag, description, features, mrpPrice, finalPrice, duration, badge, purchaseUrl, planPdf, planPdfTitle, isDayWiseSchedule, totalDays, tests, published, order } = req.body;
    
    const newItem = new DailyMains({
      title,
      category: category || 'Daily Mains',
      paperTag: paperTag || '30-Day Program',
      description: description || '',
      features: Array.isArray(features) ? features : (features ? features.split('\n').filter(f => f.trim()) : []),
      mrpPrice: parseFloat(mrpPrice || 0),
      finalPrice: parseFloat(finalPrice || 0),
      duration: duration || '30 Days Program',
      badge: badge || '30 Days Challenge',
      purchaseUrl: purchaseUrl || '/daily-mains-writing',
      planPdf: planPdf || '',
      planPdfTitle: planPdfTitle || '30-Day Mains Micro-Topics & Schedule Guide PDF',
      isDayWiseSchedule: isDayWiseSchedule !== undefined ? !!isDayWiseSchedule : true,
      totalDays: parseInt(totalDays || 30),
      tests: Array.isArray(tests) ? tests : [],
      published: published !== undefined ? published : true,
      order: parseInt(order || 0)
    });

    const saved = await newItem.save();
    return res.status(201).json(saved);
  } catch (err) {
    console.error('Error creating Daily Mains package:', err);
    return res.status(500).json({ message: 'Server error creating Daily Mains package' });
  }
});

// @route   PUT /api/daily-mains/:id
// @desc    Update Daily Mains package
router.put('/:id', async (req, res) => {
  try {
    const item = await DailyMains.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Daily Mains package not found' });
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
    console.error('Error updating Daily Mains package:', err);
    return res.status(500).json({ message: 'Server error updating Daily Mains package' });
  }
});

// @route   DELETE /api/daily-mains/:id
// @desc    Delete Daily Mains package
router.delete('/:id', async (req, res) => {
  try {
    const item = await DailyMains.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Daily Mains package not found' });
    }
    await item.deleteOne();
    return res.json({ message: 'Daily Mains package deleted successfully' });
  } catch (err) {
    console.error('Error deleting Daily Mains package:', err);
    return res.status(500).json({ message: 'Server error deleting Daily Mains package' });
  }
});

module.exports = router;
