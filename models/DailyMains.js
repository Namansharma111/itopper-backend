const mongoose = require('mongoose');

const TestItemSchema = new mongoose.Schema({
  id: { type: String },
  testName: { type: String },
  testTitle: { type: String },
  questionPdf: { type: String, default: '' },
  day: { type: Number, default: 1 },
  textNote: { type: String, default: '' }
});

const DailyMainsSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    default: 'Daily Mains' 
  },
  paperTag: { type: String, default: '30-Day Program' },
  description: { type: String, default: '' },
  features: [{ type: String }],
  mrpPrice: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },
  duration: { type: String, default: '30 Days Program' },
  badge: { type: String, default: '30 Days Challenge' },
  purchaseUrl: { type: String, default: '/daily-mains-writing' },
  planPdf: { type: String, default: '' },
  planPdfTitle: { type: String, default: '30-Day Mains Micro-Topics & Schedule Guide PDF' },
  isDayWiseSchedule: { type: Boolean, default: true },
  totalDays: { type: Number, default: 30 },
  tests: [TestItemSchema],
  published: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DailyMains', DailyMainsSchema);
