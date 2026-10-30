const test=require('node:test'),assert=require('node:assert/strict'),{interpolate}=require('../editor-scroll.js');
test('linked scroll positions interpolate within each section in either direction',()=>{
 const points=[[0,0],[100,400],[300,500],[500,1000]];
 assert.equal(interpolate(50,points),200);assert.equal(interpolate(200,points),450);
 assert.equal(interpolate(750,points,1,0),400);assert.equal(interpolate(400,points,1,0),100);
 assert.equal(interpolate(-10,points),0);assert.equal(interpolate(900,points),1000);
});
test('a document that fits in one pane never produces NaN at an endpoint',()=>{
 assert.equal(interpolate(0,[[0,0],[0,100]]),0);assert.equal(interpolate(50,[[0,0],[0,100]],1,0),0);
});
