const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const http=require('node:http');

test('Prelims uploads authenticate admins and deliver PDF/image URLs with correct Cloudinary asset types',async()=>{
  const calls=[];
  require.cache[require.resolve('../config/cloudinary')]={exports:{uploader:{upload:async(data,options)=>{
    calls.push({data,options});
    return {secure_url:`https://res.cloudinary.com/test/${options.resource_type}/upload/${options.public_id || 'image.png'}`,public_id:options.public_id || 'image',bytes:100};
  }}}};
  require.cache[require.resolve('../middleware/auth')]={exports:{
    protect:(req,res,next)=>req.headers.authorization ? next() : res.status(401).json({message:'Login required'}),
    admin:(req,res,next)=>req.headers.authorization==='Bearer admin' ? next() : res.status(403).json({message:'Admin required'})
  }};
  const app=express();app.use('/upload',require('../routes/upload'));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/upload`;
  const upload=(folder,content,mime,name,token='admin')=>{
    const data=new FormData();data.append('file',new Blob([content],{type:mime}),name);data.append('folder',folder);
    return fetch(url,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:data});
  };
  try{
    assert.equal((await upload('prelims_brochures','%PDF-1.7 test','application/pdf','brochure.pdf',null)).status,401);
    assert.equal((await upload('prelims_images','image','image/png','poster.png','student')).status,403);
    assert.equal((await upload('prelims_brochures','not a pdf','application/pdf','fake.pdf')).status,400);
    assert.equal((await upload('prelims_images','not an image','text/plain','fake.txt')).status,400);
    const pdf=await upload('prelims_brochures','%PDF-1.7 test','application/pdf','brochure.pdf');
    assert.equal(pdf.status,200);assert.match((await pdf.json()).url,/\/raw\/upload\/brochure-.*\.pdf$/);
    assert.equal(calls[0].options.resource_type,'raw');assert.equal(calls[0].options.folder,'prelims_brochures');
    assert.equal(calls[0].options.overwrite,false);
    const image=await upload('prelims_images','image','image/png','poster.png');
    assert.equal(image.status,200);assert.equal(calls[1].options.resource_type,'image');
    const existing=await upload('blog_cover_images','image','image/png','cover.png',null);
    assert.equal(existing.status,200);assert.equal(calls[2].options.resource_type,'auto');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
