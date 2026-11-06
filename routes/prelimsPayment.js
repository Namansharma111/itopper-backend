const express = require('express');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const Program = require('../models/PrelimsProgram');
const Transaction = require('../models/PaymentTransaction');
const Enrollment = require('../models/Enrollment');

module.exports = ({ getRazorpayInstance }) => {
  const router = express.Router();
  router.use(protect);

  router.post('/create-order', async (req, res) => {
    try {
      const batch = req.body.courseId === 'prelims-plus-2027-online' ? 'online'
        : req.body.courseId === 'prelims-plus-2027-offline' ? 'offline' : null;
      if (!batch) return res.status(400).json({ message: 'Select an online or offline Prelims batch.' });
      const program = await Program.findOne({ slug: 'prelims-plus-2027' });
      const amount = Number(program?.[`${batch}Price`] ?? (batch === 'online' ? 4999 : 9999));
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'This batch is not available for purchase. Please contact our team.' });
      // Reject a stale page price before opening the gateway.
      if (Number(req.body.amount) !== amount) return res.status(409).json({ message: 'The batch price has changed. Refresh the course page before subscribing.' });
      const courseId = `prelims-plus-2027-${batch}`;
      if (await Enrollment.findOne({ studentId: req.user._id, courseId, status: 'Active' })) {
        return res.status(409).json({ message: 'You already own this batch. Open My Courses to access your classes.' });
      }
      const itemName = `${program?.title || 'iTopper Prelims PLUS 2027'} — ${batch === 'online' ? 'Online Batch' : 'Offline Batch (ORN Center)'}`;
      const notes = { courseId, batch, itemType: 'Prelims', title: itemName, studentId: String(req.user._id), studentName: req.user.name, studentEmail: req.user.email };
      const receipt = `prelims_${batch}_${Date.now()}`;
      const razorpay = getRazorpayInstance();
      const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt, notes });
      await Transaction.create({ orderId: order.id, receipt, studentId: req.user._id, studentName: req.user.name, studentEmail: req.user.email, courseId, itemType: 'Prelims', itemName, amount, currency: 'INR', status: 'CREATED', notes });
      res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency, key: razorpay.key_id });
    } catch (err) { res.status(500).json({ message: 'Unable to start Prelims checkout. Please try again.' }); }
  });

  router.post('/verify', async (req, res) => {
    try {
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
      if (!orderId || !paymentId || !signature) return res.status(400).json({ message: 'Payment verification details are missing.' });
      const txn = await Transaction.findOne({ orderId, itemType: 'Prelims', studentId: req.user._id });
      if (!txn) return res.status(404).json({ message: 'Payment order not found for this account.' });
      const razorpay = getRazorpayInstance();
      const expected = crypto.createHmac('sha256', razorpay.key_secret).update(`${orderId}|${paymentId}`).digest('hex');
      if (!/^[a-f0-9]{64}$/i.test(signature) || !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
        return res.status(400).json({ message: 'Payment signature could not be verified.' });
      }
      const payment = await razorpay.payments.fetch(paymentId);
      if (payment.order_id !== txn.orderId || payment.currency !== txn.currency || payment.amount !== Math.round(txn.amount * 100) || payment.status !== 'captured') {
        return res.status(409).json({ message: 'Payment is awaiting confirmation. Please contact support with your payment ID before retrying payment.' });
      }
      // Fulfill from the persisted order, never browser-supplied prices or identities.
      const enrollment = await Enrollment.findOneAndUpdate({ studentId: txn.studentId, courseId: txn.courseId }, { $setOnInsert: {
        studentId: txn.studentId, studentName: txn.studentName, studentEmail: txn.studentEmail,
        courseId: txn.courseId, courseName: txn.itemName, pricePaid: txn.amount,
        paymentId, status: 'Active'
      } }, { upsert: true, new: true, runValidators: true });
      txn.paymentId = paymentId; txn.signature = signature; txn.status = 'VERIFIED'; txn.fulfillmentStatus = 'FULFILLED';
      await txn.save();
      res.json({ success: true, paymentId, orderId, enrollment });
    } catch (err) { res.status(503).json({ message: 'Payment confirmation could not be saved. Please contact support with your payment ID before retrying payment.' }); }
  });
  return router;
};
