const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { randomUUID } = require('crypto');
const { protect, admin } = require('../middleware/auth');
const prelimsFolders = new Set(['prelims_images', 'prelims_brochures', 'prelims_faculty']);
const authorizePrelimsUpload = (req, res, next) => prelimsFolders.has(req.body.folder)
  ? protect(req, res, () => admin(req, res, next)) : next();

// Multer in-memory storage for handling multipart form file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max limit
});

// @route   POST /api/upload
// @desc    Upload file (PDF or Image) to Cloudinary and return HTTPS URL
router.post('/', upload.single('file'), authorizePrelimsUpload, async (req, res) => {
  try {
    let fileStreamOrBase64;
    let folder = req.body.folder || 'itopper_docs';
    const isPrelims = prelimsFolders.has(folder);
    const isBrochure = folder === 'prelims_brochures';
    if (isPrelims) {
      if (!req.file?.buffer?.length) return res.status(400).json({ message: 'Choose a non-empty file to upload.' });
      if (isBrochure && !req.file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) return res.status(400).json({ message: 'Choose a valid PDF file for the brochure.' });
      if (!isBrochure && !['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(req.file.mimetype)) return res.status(400).json({ message: 'Choose a JPG, PNG, WEBP, GIF or AVIF image.' });
    }

    if (req.file) {
      // Buffer from multipart upload
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const mime = req.file.mimetype || 'application/pdf';
      fileStreamOrBase64 = `data:${mime};base64,${b64}`;
    } else if (req.body.fileData) {
      // Base64 string from client
      fileStreamOrBase64 = req.body.fileData;
    } else {
      return res.status(400).json({ message: 'No file uploaded or fileData provided' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(fileStreamOrBase64, {
      folder: folder,
      resource_type: isBrochure ? 'raw' : isPrelims ? 'image' : 'auto',
      ...(isBrochure ? { public_id: `brochure-${randomUUID()}.pdf`, overwrite: false } : {}),
      use_filename: true,
      unique_filename: true
    });

    return res.json({
      success: true,
      url: result.secure_url || result.url,
      public_id: result.public_id,
      format: result.format,
      bytes: result.bytes
    });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return res.status(500).json({
      message: 'Failed to upload file to Cloudinary',
      error: err.message
    });
  }
});

module.exports = router;
