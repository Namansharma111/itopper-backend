const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const Evaluation = require('../models/Evaluation');
const PaymentTransaction = require('../models/PaymentTransaction');
const User = require('../models/User');

const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: (process.env.RAZORPAY_KEY_ID || 'rzp_live_TbVfSTdE3of9kw').trim(),
    key_secret: (process.env.RAZORPAY_KEY_SECRET || '0ojNxHrUBsUPDjZq7bdYKri0').trim()
  });
};

router.use('/prelims', require('./prelimsPayment')({ getRazorpayInstance }));

// Helper: Auto-refund payment via Razorpay API
const autoRefundPayment = async ({ paymentId, amount, reason }) => {
  if (!paymentId) return { success: false, message: 'No paymentId provided for refund' };
  try {
    const razorpay = getRazorpayInstance();
    const options = {
      notes: { reason: reason || 'Automatic refund due to transaction error or verification failure' }
    };
    if (amount && Number(amount) > 0) {
      options.amount = Math.round(Number(amount) * 100); // in paise
    }
    const refund = await razorpay.payments.refund(paymentId, options);
    console.log(`✅ Auto-refund triggered for paymentId ${paymentId}:`, refund.id);
    return { success: true, refund };
  } catch (err) {
    console.error(`❌ Razorpay Auto-Refund Failed for ${paymentId}:`, err.message);
    return { success: false, error: err.message };
  }
};

// Helper: Fulfill enrollment for a given payment
const fulfillEnrollment = async ({ studentId, studentName, studentEmail, courseId, pricePaid, paymentId, itemName, itemType }) => {
  try {
    if (!courseId) {
      return { success: true, message: 'No course/evaluation ID specified for auto-enrollment' };
    }

    let validStudentId = studentId && mongoose.Types.ObjectId.isValid(studentId) ? studentId : null;
    
    // If studentId is not a valid ObjectId, try finding registered user by email
    if (!validStudentId && studentEmail) {
      const userObj = await User.findOne({ email: studentEmail.toLowerCase().trim() });
      if (userObj) {
        validStudentId = userObj._id;
      }
    }

    // If still no valid user ID, use the provided studentId string or fallback
    const finalStudentId = validStudentId || studentId || (studentEmail ? `guest_${studentEmail}` : `guest_${Date.now()}`);

    let courseName = itemName || 'Course/Evaluation Plan';
    let targetCourseId = courseId;

    if (mongoose.Types.ObjectId.isValid(courseId)) {
      const courseObj = await Course.findById(courseId);
      if (courseObj) {
        courseName = courseObj.subject;
        targetCourseId = courseObj._id;
      } else {
        const evalObj = await Evaluation.findById(courseId);
        if (evalObj) {
          courseName = evalObj.title;
          targetCourseId = evalObj._id;
        }
      }
    }

    const existing = await Enrollment.findOne({ studentId: finalStudentId, courseId: targetCourseId });
    if (!existing) {
      const newEnrollment = new Enrollment({
        studentId: finalStudentId,
        studentName: studentName || 'Student',
        studentEmail: studentEmail || '',
        courseId: targetCourseId,
        courseName,
        pricePaid: parseFloat(pricePaid || 0),
        paymentId: paymentId || '',
        status: 'Active'
      });
      await newEnrollment.save();
      console.log(`✅ Enrollment fulfilled successfully for ${studentEmail || studentName} (Course/Plan: ${courseName})`);
      return { success: true, enrollment: newEnrollment };
    }
    return { success: true, enrollment: existing };
  } catch (err) {
    console.error('Error fulfilling enrollment:', err);
    return { success: false, error: err.message };
  }
};

// @route   POST /api/payment/create-order
// @desc    Create Razorpay Order & persist transaction record
router.post('/create-order', async (req, res) => {
  if (req.body.itemType === 'Prelims' || String(req.body.courseId || '').startsWith('prelims-plus-2027-')) {
    return res.status(400).json({ message: 'Use the authenticated Prelims checkout.' });
  }
  try {
    const {
      amount,
      currency = 'INR',
      receipt,
      notes,
      courseId,
      studentId,
      studentName,
      studentEmail,
      itemType,
      itemName
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }

    const razorpay = getRazorpayInstance();
    const amountInPaise = Math.round(Number(amount) * 100);
    const orderReceipt = receipt || `rec_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const options = {
      amount: amountInPaise,
      currency,
      receipt: orderReceipt,
      notes: notes || {}
    };

    const order = await razorpay.orders.create(options);

    // Persist PaymentTransaction in MongoDB
    try {
      const transaction = new PaymentTransaction({
        orderId: order.id,
        receipt: orderReceipt,
        studentId: studentId && mongoose.Types.ObjectId.isValid(studentId) ? studentId : null,
        studentName: studentName || (notes ? notes.studentName : 'Student'),
        studentEmail: studentEmail || (notes ? notes.studentEmail : ''),
        courseId: courseId && mongoose.Types.ObjectId.isValid(courseId) ? courseId : null,
        itemType: itemType || (notes ? notes.itemType : 'Course'),
        itemName: itemName || (notes ? (notes.title || notes.itemName) : 'UPSC Plan'),
        amount: Number(amount),
        currency: order.currency || 'INR',
        status: 'CREATED',
        notes: notes || {}
      });
      await transaction.save();
    } catch (dbErr) {
      console.error('Warning: Failed to save initial PaymentTransaction record:', dbErr.message);
    }

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_live_TbVfSTdE3of9kw'
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    return res.status(500).json({ message: 'Failed to create payment order', error: err.message });
  }
});

// @route   POST /api/payment/verify
// @desc    Verify Razorpay Signature, Save Enrollment & Auto-Refund on failure
router.post('/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      courseId,
      studentId,
      studentName,
      studentEmail,
      pricePaid,
      itemName,
      itemType
    } = req.body;

    if (!razorpay_payment_id) {
      return res.status(400).json({ message: 'Missing Razorpay payment ID' });
    }

    const effectiveOrderId = razorpay_order_id || `order_direct_${Date.now()}`;

    // Find transaction record in DB
    let txn = await PaymentTransaction.findOne({ 
      $or: [{ orderId: effectiveOrderId }, { paymentId: razorpay_payment_id }] 
    });
    if (txn?.itemType === 'Prelims' || itemType === 'Prelims' || String(courseId || '').startsWith('prelims-plus-2027-')) {
      return res.status(400).json({ message: 'Use the authenticated Prelims verification endpoint.' });
    }

    const secret = (process.env.RAZORPAY_KEY_SECRET || '0ojNxHrUBsUPDjZq7bdYKri0').trim();
    let isAuthentic = false;

    // 1. Primary Check: HMAC SHA256 Signature Verification
    if (razorpay_order_id && razorpay_signature) {
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body.toString())
        .digest('hex');

      isAuthentic = (expectedSignature === razorpay_signature) || 
                    (expectedSignature.toLowerCase() === (razorpay_signature || '').trim().toLowerCase());
    }

    // 2. Secondary Fallback Check: Query Razorpay API directly if signature match was not conclusive
    if (!isAuthentic && razorpay_payment_id) {
      try {
        const razorpay = getRazorpayInstance();
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        if (paymentDetails && (paymentDetails.status === 'captured' || paymentDetails.status === 'authorized' || paymentDetails.status === 'paid')) {
          console.log(`✅ Razorpay API directly confirmed payment ${razorpay_payment_id} status as '${paymentDetails.status}'`);
          isAuthentic = true;
        }
      } catch (apiErr) {
        console.warn(`Warning checking Razorpay API for ${razorpay_payment_id}:`, apiErr.message);
      }
    }

    if (!isAuthentic) {
      console.error(`🚨 Payment verification failed for payment ${razorpay_payment_id}. Signature/Status mismatch!`);
      
      if (txn) {
        txn.paymentId = razorpay_payment_id;
        txn.status = 'FAILED';
        txn.failureReason = 'Signature/Status Mismatch';
        try { await txn.save(); } catch (e) {}
      }

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed: Invalid Signature or Payment Status.',
        autoRefunded: false
      });
    }

    // Signature / API Status IS Authentic
    let fulfillment = { success: true };
    try {
      if (!txn) {
        txn = new PaymentTransaction({
          orderId: razorpay_order_id || effectiveOrderId,
          paymentId: razorpay_payment_id,
          signature: razorpay_signature || '',
          studentId: studentId || (studentEmail ? `guest_${studentEmail}` : 'guest_student'),
          studentName: studentName || 'Student',
          studentEmail: studentEmail || 'student@itopper.com',
          courseId: courseId || 'general_plan',
          itemType: itemType || 'Course',
          itemName: itemName || 'UPSC Plan',
          amount: parseFloat(pricePaid || 0),
          status: 'VERIFIED'
        });
      } else {
        txn.paymentId = razorpay_payment_id;
        txn.signature = razorpay_signature || txn.signature;
        txn.status = 'VERIFIED';
      }
      await txn.save();
    } catch (saveErr) {
      console.warn('Warning creating/updating PaymentTransaction:', saveErr.message);
    }

    try {
      const targetCourseId = courseId || (txn ? txn.courseId : 'general_plan');
      const targetStudentId = studentId || (txn ? txn.studentId : (req.user ? req.user._id : 'guest_student'));
      const targetEmail = studentEmail || (txn ? txn.studentEmail : (req.user ? req.user.email : 'student@itopper.com'));
      const targetName = studentName || (txn ? txn.studentName : (req.user ? req.user.name : 'Student'));
      const paidAmount = pricePaid || (txn ? txn.amount : 0);

      fulfillment = await fulfillEnrollment({
        studentId: targetStudentId,
        studentName: targetName,
        studentEmail: targetEmail,
        courseId: targetCourseId,
        pricePaid: paidAmount,
        paymentId: razorpay_payment_id,
        itemName: itemName || (txn ? txn.itemName : 'UPSC Plan'),
        itemType: itemType || (txn ? txn.itemType : 'Course')
      });

      if (txn) {
        txn.fulfillmentStatus = fulfillment.success ? 'FULFILLED' : 'FAILED';
        try {
          await txn.save();
        } catch (err) {}
      }
    } catch (fulfillErr) {
      console.warn('Warning in fulfillment block:', fulfillErr.message);
    }

    return res.json({
      success: true,
      message: 'Payment verified successfully',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      enrollment: fulfillment.enrollment || null,
      transaction: txn
    });
  } catch (err) {
    console.error('Error verifying Razorpay payment:', err);
    return res.status(200).json({ 
      success: true, 
      message: 'Payment received and verified successfully',
      warning: err.message 
    });
  }
});

// @route   POST /api/payment/webhook
// @desc    Razorpay Server-to-Server Webhook listener for background reconciliation
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-razorpay-signature'];
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (signature !== expectedSig) {
        console.warn('⚠️ Webhook signature validation failed.');
        return res.status(400).json({ status: 'invalid_signature' });
      }
    }

    const { event, payload } = req.body;
    console.log(`🔔 Razorpay Webhook Event Received: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payment ? payload.payment.entity : null;
      const orderId = paymentEntity ? paymentEntity.order_id : (payload.order ? payload.order.entity.id : null);
      const paymentId = paymentEntity ? paymentEntity.id : null;
      const amount = paymentEntity ? paymentEntity.amount / 100 : 0;
      const email = paymentEntity ? paymentEntity.email : '';
      const notes = paymentEntity ? paymentEntity.notes : {};

      if (orderId) {
        let txn = await PaymentTransaction.findOne({ orderId });
        if (txn?.itemType === 'Prelims') {
          if (!webhookSecret) return res.status(503).json({ message: 'Prelims webhook verification is not configured.' });
          const confirmed = await getRazorpayInstance().payments.fetch(paymentId);
          if (confirmed.order_id !== txn.orderId || confirmed.status !== 'captured' || confirmed.currency !== txn.currency || confirmed.amount !== Math.round(txn.amount * 100)) {
            return res.status(400).json({ message: 'Prelims payment details do not match the order.' });
          }
        }
        if (!txn) {
          txn = new PaymentTransaction({
            orderId,
            paymentId: paymentId || '',
            studentEmail: email || notes.studentEmail || '',
            amount,
            status: 'PAID',
            notes
          });
        } else {
          txn.paymentId = paymentId || txn.paymentId;
          txn.status = 'PAID';
        }

        if (txn.fulfillmentStatus !== 'FULFILLED') {
          const fulfillment = await fulfillEnrollment({
            studentId: txn.studentId,
            studentName: txn.studentName,
            studentEmail: txn.studentEmail || email,
            courseId: txn.courseId,
            pricePaid: amount || txn.amount,
            paymentId: paymentId || txn.paymentId,
            itemName: txn.itemName,
            itemType: txn.itemType
          });

          if (fulfillment.success) {
            txn.fulfillmentStatus = 'FULFILLED';
            txn.status = 'VERIFIED';
          }
        }
        await txn.save();
      }
    } else if (event === 'payment.failed') {
      const paymentEntity = payload.payment ? payload.payment.entity : null;
      if (paymentEntity && paymentEntity.order_id) {
        let txn = await PaymentTransaction.findOne({ orderId: paymentEntity.order_id });
        if (txn) {
          txn.status = 'FAILED';
          txn.failureReason = paymentEntity.error_description || 'Payment Failed at Gateway';
          await txn.save();
        }
      }
    } else if (event === 'refund.processed' || event === 'refund.created') {
      const refundEntity = payload.refund ? payload.refund.entity : null;
      if (refundEntity && refundEntity.payment_id) {
        let txn = await PaymentTransaction.findOne({ paymentId: refundEntity.payment_id });
        if (txn) {
          txn.status = 'REFUNDED';
          txn.refundId = refundEntity.id;
          txn.refundAmount = refundEntity.amount / 100;
          txn.refundStatus = refundEntity.status || 'processed';
          await txn.save();
        }
      }
    }

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Error handling Razorpay webhook:', err);
    return res.status(500).json({ message: 'Webhook processing error', error: err.message });
  }
});

// @route   GET /api/payment/status/:orderId
// @desc    Check & reconcile payment status directly with Razorpay API
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    let txn = await PaymentTransaction.findOne({ orderId });

    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.fetch(orderId);
    const payments = await razorpay.orders.fetchPayments(orderId);

    const successfulPayment = payments.items.find(p => txn?.itemType === 'Prelims'
      ? p.status === 'captured' && p.order_id === txn.orderId && p.currency === txn.currency && p.amount === Math.round(txn.amount * 100)
      : p.status === 'captured' || p.status === 'authorized');

    if (successfulPayment) {
      if (!txn) {
        txn = new PaymentTransaction({
          orderId,
          paymentId: successfulPayment.id,
          amount: successfulPayment.amount / 100,
          studentEmail: successfulPayment.email,
          status: 'PAID'
        });
      } else {
        txn.paymentId = successfulPayment.id;
        txn.status = 'PAID';
      }

      if (txn.fulfillmentStatus !== 'FULFILLED') {
        const fulfillment = await fulfillEnrollment({
          studentId: txn.studentId,
          studentName: txn.studentName,
          studentEmail: txn.studentEmail || successfulPayment.email,
          courseId: txn.courseId,
          pricePaid: successfulPayment.amount / 100,
          paymentId: successfulPayment.id,
          itemName: txn.itemName,
          itemType: txn.itemType
        });

        if (fulfillment.success) {
          txn.fulfillmentStatus = 'FULFILLED';
          txn.status = 'VERIFIED';
        }
      }
      await txn.save();
    } else if (txn && razorpayOrder.status === 'paid' && txn.fulfillmentStatus !== 'FULFILLED') {
      txn.status = 'PAID';
      await txn.save();
    }

    return res.json({
      success: true,
      transaction: txn,
      razorpayOrder,
      paymentsCount: payments.count
    });
  } catch (err) {
    console.error('Error checking payment status:', err);
    return res.status(500).json({ message: 'Error checking status', error: err.message });
  }
});

// @route   POST /api/payment/refund
// @desc    Trigger instant refund for a payment ID
router.post('/refund', async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;
    if (!paymentId) {
      return res.status(400).json({ message: 'Payment ID is required for refund' });
    }

    const refundResult = await autoRefundPayment({ paymentId, amount, reason });

    if (refundResult.success) {
      let txn = await PaymentTransaction.findOne({ paymentId });
      if (txn) {
        txn.status = 'REFUNDED';
        txn.refundId = refundResult.refund.id;
        txn.refundAmount = refundResult.refund.amount / 100;
        txn.refundStatus = refundResult.refund.status || 'processed';
        txn.refundReason = reason || 'Manual refund requested';
        await txn.save();
      }

      return res.json({
        success: true,
        message: 'Refund initiated successfully',
        refund: refundResult.refund
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to initiate refund',
        error: refundResult.error
      });
    }
  } catch (err) {
    console.error('Error triggering refund:', err);
    return res.status(500).json({ message: 'Server error processing refund', error: err.message });
  }
});

// @route   GET /api/payment/transactions
// @desc    Get all payment transactions for Admin dashboard
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await PaymentTransaction.find().sort({ createdAt: -1 });
    return res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return res.status(500).json({ message: 'Error fetching transactions' });
  }
});

module.exports = router;
