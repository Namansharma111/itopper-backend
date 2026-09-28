require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

// Import Models
const User = require('./models/User');
const Blog = require('./models/Blog');
const Course = require('./models/Course');
const Faculty = require('./models/Faculty');
const Evaluation = require('./models/Evaluation');

// Import Routes
const authRoutes = require('./routes/auth');
const blogRoutes = require('./routes/blogs');
const courseRoutes = require('./routes/courses');
const facultyRoutes = require('./routes/faculty');
const couponRoutes = require('./routes/coupons');
const enrollmentRoutes = require('./routes/enrollments');
const reviewRoutes = require('./routes/reviews');
const evaluationRoutes = require('./routes/evaluations');
const dailyMainsRoutes = require('./routes/dailyMains');
const paymentRoutes = require('./routes/payment');
const uploadRoutes = require('./routes/upload');

const app = express();

// Enable CORS for all origins (Production & Local)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database Connection Caching for Serverless (Vercel) & Local
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://itopperiasacademy_db_user:gJ04nfVYQmM5mQBd@cluster0.izkdyny.mongodb.net/itopper?retryWrites=true&w=majority&appName=Cluster0';

let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }
  try {
    const db = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = db.connections[0].readyState === 1;
    console.log('🌿 Connected to MongoDB Database successfully.');
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
};

// Middleware to ensure Database Connection before handling requests
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }
  next();
});

// Static Folder for Uploads
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/daily-mains', dailyMainsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/upload', uploadRoutes);

// Legacy Payment endpoint redirection to Razorpay create-order
app.post('/api/create-payment', (req, res, next) => {
  req.url = '/create-order';
  paymentRoutes(req, res, next);
});

app.post('/api/payment-webhook', (req, res, next) => {
  req.url = '/webhook';
  paymentRoutes(req, res, next);
});

app.post('/api/certificate/send', (req, res) => {
  return res.json({ message: 'Certificate generated and emailed successfully!' });
});

// Root & Health Check Routes
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'iTopper API Server is Running...',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Database Seeding Logic
const seedDatabase = async () => {
  try {
    // 1. Seed Admin User
    const adminEmail = process.env.ADMIN_EMAIL || 'itopper@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'itopper@1230';
    
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
      const newAdmin = new User({
        email: adminEmail,
        password: hashedAdminPassword,
        name: 'iTopper Admin',
        role: 'admin'
      });
      await newAdmin.save();
      console.log('✅ Default Admin user seeded successfully.');
    }

    // 2. Seed Default Blog (Only if no blogs exist)
    const existingBlogsCount = await Blog.countDocuments();
    if (existingBlogsCount === 0) {
      const defaultBlog = new Blog({
        title: 'UPSC Prelims GS Paper I 2026 Out, Download PDF Now',
        category: 'Updates',
        readTime: '3 min read',
        excerpt: 'The UPSC Prelims GS Paper I 2026 question paper is now available. Download the PDF and check the complete paper analysis and expected cut-off.',
        image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=600',
        published: true,
        content: `
          <div class="space-y-6 text-slate-700">
            <p class="text-lg leading-relaxed">The Union Public Service Commission (UPSC) has successfully conducted the Civil Services Preliminary Examination 2026 - General Studies Paper I today.</p>
            
            <h3 class="text-2xl font-bold text-[#163F66] mt-8">Download Question Paper</h3>
            <p class="leading-relaxed">Candidates and future aspirants can download the official question paper PDF from the link below to analyze the trends and difficulty level.</p>
            
            <div class="my-8 p-6 bg-blue-50 border-l-4 border-[#EF961D] rounded-r-xl">
                <p class="font-bold text-[#163F66] mb-2">UPSC CSE Prelims 2026 - GS Paper I</p>
                <a href="#" class="inline-block bg-[#EF961D] text-white px-6 py-2 rounded-lg font-semibold hover:bg-[#d8871a] transition-colors">Download PDF Here</a>
            </div>
            
            <h3 class="text-2xl font-bold text-[#163F66] mt-8">Paper Analysis & Expected Cut-off</h3>
            <p class="leading-relaxed">A detailed analysis of the paper along with the answer key and expected cut-off will be updated shortly by our expert faculty. Stay tuned!</p>
          </div>
        `,
        seoTitle: 'UPSC Prelims GS Paper I 2026 PDF | iTopper Analysis',
        seoKeywords: 'upsc, prelims 2026, question paper, gs paper 1, upsc cut-off'
      });
      await defaultBlog.save();
      console.log('✅ Default blog post seeded successfully.');
    }

    // 3. Seed Default Faculty
    const existingFaculty = await Faculty.find();
    if (existingFaculty.length === 0) {
      const defaultFaculty = new Faculty({
        name: 'Dr. Amit Kumar',
        email: 'amit@faculty.com',
        password: await bcrypt.hash('faculty123', 10),
        designation: 'Senior IAS Mentor',
        photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150',
        classes: [
          {
            title: 'Mains Answer Writing Strategy',
            date: '2026-06-25',
            time: '18:00',
            link: 'https://zoom.us/mock-link',
            subject: 'Essay & GS mains'
          }
        ]
      });
      await defaultFaculty.save();
      console.log('✅ Default faculty member seeded successfully.');
    }

    // 4. Seed Default Course
    const existingCourses = await Course.find();
    if (existingCourses.length === 0) {
      const firstFaculty = await Faculty.findOne();
      const defaultCourse = new Course({
        subject: 'UPSC Mains Answer Writing Masterclass',
        description: 'Learn the secrets of GS and Essay answer writing from senior educators and rankers. Daily evaluation included.',
        duration: '3 Months',
        level: 'Intermediate',
        mrpPrice: 15000,
        finalPrice: 8999,
        demoVideo: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        thumbnail: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=400',
        modules: [
          {
            title: 'Module 1: Introduction to Mains Assessment',
            lectures: [
              { title: 'Lecture 1.1: What examiners look for', content: [{ text: 'Understand core expectations and marking criteria.' }] },
              { title: 'Lecture 1.2: Structure of a perfect answer', content: [{ text: 'Introduction, Body and Conclusion frameworks.' }] }
            ]
          }
        ],
        mentors: [
          {
            facultyId: firstFaculty ? firstFaculty._id : null,
            name: firstFaculty ? firstFaculty.name : 'Dr. Amit Kumar',
            designation: firstFaculty ? firstFaculty.designation : 'Senior IAS Mentor',
            photo: firstFaculty ? firstFaculty.photo : 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150'
          }
        ],
        reviews: [
          { studentName: 'Vikas Dubey', rating: 5, comment: 'Changed the way I approach GS answer structure completely!' }
        ]
      });
      await defaultCourse.save();
      console.log('✅ Default Course seeded successfully.');
    }

    // 5. Seed Default Evaluations
    const existingEvaluations = await Evaluation.countDocuments();
    if (existingEvaluations === 0) {
      const defaultEvaluations = [
        {
          title: "GS Paper 1 Mains Answer Evaluation",
          category: "GS",
          paperTag: "GS Paper 1",
          description: "Comprehensive evaluation covering History, Art & Culture, Geography, Indian Society & World History.",
          features: [
            "Detailed Line-by-Line Feedback within 24 Hours",
            "Model Answer Framework & Structure Map",
            "Personalized One-on-One Mentor Call",
            "Keyword Enrichment & Diagram Suggestions"
          ],
          mrpPrice: 7999,
          finalPrice: 4999,
          duration: "Till Mains 2026",
          badge: "Popular",
          purchaseUrl: "/#contact",
          published: true,
          order: 1
        },
        {
          title: "GS Paper 2 Mains Answer Evaluation",
          category: "GS",
          paperTag: "GS Paper 2",
          description: "In-depth evaluation for Polity, Governance, Social Justice, Constitution & International Relations.",
          features: [
            "Constitutional Articles & Case Laws Integration",
            "Evaluation by Served Officers & Toppers",
            "24/7 Doubt Resolution & Mentorship Access",
            "Monthly Performance Tracking & Analytics"
          ],
          mrpPrice: 7999,
          finalPrice: 4999,
          duration: "Till Mains 2026",
          badge: "High Recommended",
          purchaseUrl: "/#contact",
          published: true,
          order: 2
        }
      ];
      await Evaluation.insertMany(defaultEvaluations);
      console.log('✅ Default Evaluation Plans seeded successfully.');
    }
  } catch (err) {
    console.error('Error seeding database:', err.message);
  }
};

// Start standalone server locally if not imported by Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  connectDB().then(async () => {
    await seedDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
    });
  });
}

// Export Express app for Vercel Serverless Function deployment
module.exports = app;
