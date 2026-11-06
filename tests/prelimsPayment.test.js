const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');

test('Prelims purchase: trusted pricing, selected batch, verified enrollment, retry and rejection paths', async () => {
  let program = null, payment = null, orderNumber = 0;
  const transactions = [], enrollments = [];
  const matches = (item, filter) => Object.entries(filter).every(([key,value]) => value?.$in ? value.$in.includes(item[key]) : String(item[key]) === String(value));
  const inject = (name, exports) => { require.cache[require.resolve(name)] = { exports }; };
  inject('../middleware/auth', { protect: (req,res,next) => {
    if (!req.headers.authorization) return res.status(401).end();
    req.user = { _id: req.headers.authorization === 'Bearer other' ? 'other-user' : 'student-1', name: 'Registered Student', email: 'registered@example.com', role: req.headers.authorization === 'Bearer admin' ? 'admin' : 'student' }; next();
  }, admin: (req,res,next) => req.user.role === 'admin' ? next() : res.status(403).end() });
  inject('../models/PrelimsProgram', { findOne: async () => program });
  inject('../models/PaymentTransaction', {
    create: async data => { const txn = { ...data, save: async () => {} }; transactions.push(txn); return txn; },
    findOne: async filter => transactions.find(t => matches(t,filter)) || null
  });
  inject('../models/Enrollment', {
    find: filter => ({ sort: async () => enrollments.filter(e => matches(e,filter)) }),
    findOne: async filter => enrollments.find(e => matches(e,filter)) || null,
    findOneAndUpdate: async (filter, update) => {
      let enrollment = enrollments.find(e => matches(e,filter));
      if (!enrollment) { enrollment = update.$setOnInsert; enrollments.push(enrollment); }
      return enrollment;
    }
  });
  const provider = {
    key_id: 'test-key', key_secret: 'test-secret',
    orders: { create: async options => ({ ...options, id: `order_${++orderNumber}` }) },
    payments: { fetch: async () => payment }
  };
  const app = express(); app.use(express.json());
  app.use('/prelims', require('../routes/prelimsPayment')({ getRazorpayInstance: () => provider }));
  app.use('/program', require('../routes/prelimsProgram'));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}/prelims`;
  const post = (path, body, token = 'student') => fetch(`${url}/${path}`, { method:'POST', headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) }, body:JSON.stringify(body) });
  const orderBody = { courseId:'prelims-plus-2027-online', amount:4999, studentId:'forged-id', studentEmail:'forged@example.com' };
  try {
    assert.equal((await post('create-order',orderBody,null)).status,401);
    assert.equal((await post('create-order',{...orderBody,courseId:'invalid'})).status,400);
    assert.equal((await post('create-order',{...orderBody,amount:1})).status,409);
    const orderResponse = await post('create-order',orderBody);
    assert.equal(orderResponse.status,200);
    const order = await orderResponse.json();
    assert.equal(order.amount,499900);
    assert.equal(transactions[0].studentEmail,'registered@example.com');
    assert.equal(transactions[0].courseId,'prelims-plus-2027-online');
    assert.equal(enrollments.length,0);
    const paymentId = 'pay_online';
    const signature = crypto.createHmac('sha256',provider.key_secret).update(`${order.orderId}|${paymentId}`).digest('hex');
    const verification = { razorpay_order_id:order.orderId, razorpay_payment_id:paymentId, razorpay_signature:signature, pricePaid:1, courseId:'forged-course' };
    assert.equal((await post('verify',verification,'other')).status,404);
    assert.equal((await post('verify',{...verification,razorpay_signature:'invalid'})).status,400);
    payment = { order_id:order.orderId, amount:100, currency:'INR', status:'captured' };
    assert.equal((await post('verify',verification)).status,409);
    payment.amount = 499900; payment.status = 'authorized';
    assert.equal((await post('verify',verification)).status,409);
    assert.equal(enrollments.length,0);
    payment.status = 'captured';
    const confirmed = await post('verify',verification);
    assert.equal(confirmed.status,200);
    const result = await confirmed.json();
    assert.equal(result.enrollment.pricePaid,4999);
    assert.equal(result.enrollment.courseId,'prelims-plus-2027-online');
    assert.equal(result.enrollment.studentId,'student-1');
    assert.equal(transactions[0].fulfillmentStatus,'FULFILLED');
    const api = url.replace('/prelims','/program');
    assert.equal((await fetch(`${api}/purchases`)).status,401);
    const restored = await (await fetch(`${api}/purchases`, {headers:{Authorization:'Bearer student'}})).json();
    assert.equal(restored.enrollments.length,1);
    assert.equal(restored.enrollments[0].pricePaid,4999);
    const otherPurchases = await (await fetch(`${api}/purchases`, {headers:{Authorization:'Bearer other'}})).json();
    assert.equal(otherPurchases.enrollments.length,0);
    assert.equal((await fetch(`${api}/sales`, {headers:{Authorization:'Bearer student'}})).status,403);
    const sales = await (await fetch(`${api}/sales`, {headers:{Authorization:'Bearer admin'}})).json();
    assert.equal(sales.length,1);
    assert.equal(sales[0].paymentId,paymentId);
    assert.equal((await post('verify',verification)).status,200);
    assert.equal(enrollments.length,1);
    assert.equal((await post('create-order',orderBody)).status,409);
    program = { title:'Updated Prelims', offlinePrice:8999 };
    assert.equal((await post('create-order',{courseId:'prelims-plus-2027-offline',amount:9999})).status,409);
    const offline = await post('create-order',{courseId:'prelims-plus-2027-offline',amount:8999});
    assert.equal(offline.status,200);
    assert.equal((await offline.json()).amount,899900);
    assert.equal(transactions[1].courseId,'prelims-plus-2027-offline');
    assert.match(transactions[1].itemName,/Updated Prelims.*Offline/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
