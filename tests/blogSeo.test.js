const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { blogSlug, seoFields } = require('../utils/blogSeo');

test('Blog SEO: slug URLs, old links, per-article fields, duplicate validation and formatted content', async () => {
  const blogs = [];
  const matches = (blog, filter) => Object.entries(filter).every(([key,value]) => {
    if (key === '$or') return value.some(option => matches(blog,option));
    if (value?.$ne) return String(blog[key]) !== String(value.$ne);
    return Array.isArray(blog[key]) ? blog[key].includes(value) : String(blog[key]) === String(value);
  });
  class Blog {
    constructor(data) { Object.assign(this,data); this._id = (blogs.length + 1).toString().padStart(24,'0'); this.slugHistory = []; }
    async save() { if (!blogs.includes(this)) blogs.push(this); return this; }
    static async findOne(filter) { return blogs.find(blog => matches(blog,filter)) || null; }
    static async findById(id) { return blogs.find(blog => blog._id === id) || null; }
    static find() { return { sort:async () => blogs }; }
  }
  require.cache[require.resolve('../models/Blog')] = {exports:Blog};
  require.cache[require.resolve('../middleware/auth')] = {exports:{
    protect:(req,res,next) => req.headers.authorization ? next() : res.status(401).end(),
    admin:(req,res,next) => req.headers.authorization === 'Bearer admin' ? next() : res.status(403).end()
  }};
  const app = express(); app.use(express.json()); app.use('/blogs',require('../routes/blogs'));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}/blogs`;
  const request = (method,path,data,token = 'admin') => fetch(url+path,{method,headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},body:JSON.stringify(data)});
  const body = {
    title:'UPSC Prelims Strategy 2027', excerpt:'Prepare effectively.',
    content:'<h2 style="text-align: center">Study plan</h2><p><span style="font-size: 24px; color: #ff0000">Important</span></p><table><tr><td>PYQs</td></tr></table>',
    seoTitle:'Prelims strategy | iTopper',seoDescription:'A unique article meta description.',focusKeyword:'UPSC Prelims',seoKeywords:'PYQs, strategy',imageAlt:'UPSC notes',noIndex:false
  };
  try {
    assert.equal((await request('POST','',body,null)).status,401);
    const created = await request('POST','',body); assert.equal(created.status,201);
    const blog = await created.json(); assert.equal(blog.slug,'upsc-prelims-strategy-2027');
    const bySlug = await (await fetch(`${url}/${blog.slug}`)).json();
    assert.equal(bySlug.seoDescription,body.seoDescription); assert.equal(bySlug.content,body.content);
    assert.equal((await fetch(`${url}/${blog._id}`)).status,200);
    const duplicate = await request('POST','',{...body,slug:blog.slug}); assert.equal(duplicate.status,409);
    const autoDuplicate = await (await request('POST','',body)).json(); assert.equal(autoDuplicate.slug,`${blog.slug}-2`);
    const renamed = await (await request('PUT',`/${blog._id}`,{slug:'new-prelims-guide',seoDescription:'Updated summary',noIndex:true})).json();
    assert.equal(renamed.slug,'new-prelims-guide'); assert.deepEqual(renamed.slugHistory,[blog.slug]);
    assert.equal(renamed.content,body.content); assert.equal(renamed.noIndex,true);
    const oldLink = await (await fetch(`${url}/${blog.slug}`)).json(); assert.equal(oldLink._id,blog._id);
    assert.equal((await request('POST','',{...body,slug:blog.slug})).status,409,'Old slugs stay reserved');
    const preserved = await (await request('PUT',`/${blog._id}`,{title:'Changed title'})).json(); assert.equal(preserved.slug,'new-prelims-guide');
    assert.equal((await request('PUT',`/${blog._id}`,{canonicalUrl:'javascript:alert(1)'})).status,400);
    assert.equal((await request('PUT',`/${blog._id}`,{slug:{bad:true}})).status,400);
    const legacy = new Blog({...body}); await legacy.save();
    assert.equal((await fetch(`${url}/${legacy._id}`)).status,200,'Legacy IDs remain accessible');
    assert.equal(blogSlug('Café & UPSC Tips!'),'cafe-upsc-tips');
    assert.match(blogSlug('123456789012345678901234'),/^article-/);
    assert.throws(() => seoFields({noIndex:'false'}));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
