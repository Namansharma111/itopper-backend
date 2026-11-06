const mongoose = require('mongoose');

const session = new mongoose.Schema({
  title: { type: String, required: true }, subject: String, date: String,
  time: String, duration: String, link: String, note: String, isDemo: Boolean
}, { _id: false });
const schema = new mongoose.Schema({
  slug: { type: String, default: 'prelims-plus-2027', unique: true },
  title: { type: String, required: true }, tagline: String, description: String,
  startDate: String, timings: String, format: String, totalClasses: Number,
  onlinePrice: Number, onlineMrp: Number, offlinePrice: Number, offlineMrp: Number,
  brochure: String, image: String, enrollmentUrl: String, phone: String,
  facultyName: String, facultyBio: String, facultyImage: String,
  features: [String], questionTypes: [String], subjects: [String],
  sessions: [session], faqs: [{ question: String, answer: String, _id: false }]
}, { timestamps: true });
module.exports = mongoose.model('PrelimsProgram', schema);
