const mongoose = require('mongoose');

const TestItemSchema = new mongoose.Schema({
  id: { type: String },
  testName: { type: String },
  testTitle: { type: String },
  questionPdf: { type: String, default: '' },
  day: { type: Number, default: 1 },
  textNote: { type: String, default: '' }
});

const EvaluationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    enum: ['GS', 'Optional', 'Combo'], 
    default: 'GS' 
  },
  paperTag: { type: String, default: '' },
  description: { type: String, default: '' },
  features: [{ type: String }],
  mrpPrice: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },
  duration: { type: String, default: '3 Months' },
  badge: { type: String, default: '' },
  purchaseUrl: { type: String, default: '/#contact' },
  planPdf: { type: String, default: '' },
  planPdfTitle: { type: String, default: 'Program Syllabus & Micro-Topics Overview PDF' },
  isDayWiseSchedule: { type: Boolean, default: false },
  totalDays: { type: Number, default: 30 },
  tests: [TestItemSchema],
  published: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Evaluation', EvaluationSchema);
