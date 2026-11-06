const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    default: 'Strategy',
    trim: true
  },
  readTime: {
    type: String,
    default: '5 min read',
    trim: true
  },
  excerpt: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    required: true
  },
  published: {
    type: Boolean,
    default: true
  },
  seoTitle: {
    type: String,
    trim: true
  },
  seoKeywords: {
    type: String,
    trim: true
  },
  seoDescription: { type: String, trim: true, default: '' },
  focusKeyword: { type: String, trim: true, default: '' },
  slug: { type: String, trim: true, unique: true, sparse: true },
  slugHistory: { type: [String], default: [] },
  canonicalUrl: { type: String, trim: true, default: '' },
  noIndex: { type: Boolean, default: false },
  imageAlt: { type: String, trim: true, default: '' },
  date: {
    type: String,
    default: () => new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    })
  }
}, { timestamps: true });

// Convert the virtual `id` to string format for matching frontend's expectations
BlogSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

BlogSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});

module.exports = mongoose.model('Blog', BlogSchema);
