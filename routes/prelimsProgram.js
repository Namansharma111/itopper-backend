const router = require('express').Router();
const Program = require('../models/PrelimsProgram');
const { protect, admin } = require('../middleware/auth');
const Enrollment = require('../models/Enrollment');

router.get('/sales', protect, admin, async (req, res) => {
  try {
    const sales = await Enrollment.find({ courseId: { $in: ['prelims-plus-2027-online', 'prelims-plus-2027-offline'] }, status: 'Active' }).sort({ createdAt: -1 });
    res.json(sales);
  } catch { res.status(500).json({ message: 'Unable to load Prelims sales.' }); }
});

router.get('/purchases', protect, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ studentId: req.user._id, courseId: { $in: ['prelims-plus-2027-online', 'prelims-plus-2027-offline'] }, status: 'Active' }).sort({ createdAt: -1 });
    const program = await Program.findOne({ slug: 'prelims-plus-2027' });
    res.json({ program, enrollments });
  } catch { res.status(500).json({ message: 'Unable to load your Prelims purchases. Please try again.' }); }
});

router.get('/', async (req, res) => {
  try { res.json(await Program.findOne({ slug: 'prelims-plus-2027' })); }
  catch { res.status(500).json({ message: 'Unable to load Prelims program' }); }
});

router.put('/', protect, admin, async (req, res) => {
  try {
    const fields = ['title','tagline','description','startDate','timings','format','totalClasses','onlinePrice','onlineMrp','offlinePrice','offlineMrp','brochure','image','enrollmentUrl','phone','facultyName','facultyBio','facultyImage','features','questionTypes','subjects','sessions','faqs'];
    const data = Object.fromEntries(fields.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    const validLink = value => !value || /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value);
    const links = ['brochure','image','enrollmentUrl','facultyImage'].map(k => data[k]);
    if (data.sessions && !Array.isArray(data.sessions)) return res.status(400).json({ message: 'Classes must be a list' });
    links.push(...(data.sessions || []).map(s => s.link));
    if (links.some(link => !validLink(link))) return res.status(400).json({ message: 'Use a full http:// or https:// URL for links' });
    res.json(await Program.findOneAndUpdate({ slug: 'prelims-plus-2027' }, { $set: data }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }));
  } catch (err) { res.status(400).json({ message: err.message || 'Unable to save program' }); }
});
module.exports = router;
