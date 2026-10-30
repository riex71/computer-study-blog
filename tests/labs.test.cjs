const test=require('node:test'),assert=require('node:assert/strict'),{address,analyse}=require('../article-labs.js');
test('explanatory addresses are repeatable and remain in the chosen table',()=>{
  for(const buckets of [4,8,16,32])for(let head=0;head<4;head++){
    const value=address([7,11,5],head,buckets);assert.equal(value,address([7,11,5],head,buckets));assert.ok(value>=0&&value<buckets);
  }
});
test('collision counts distinguish one head from the full address signature',()=>{
  const inputs=[[7,11,5],[3,8,2],[7,1,5],[2,6,9],[4,8,3],[9,2,6]],one=analyse(inputs,1,4),four=analyse(inputs,4,4);
  assert.ok(one.firstHead>0);assert.equal(one.firstHead,one.allHeads);assert.ok(four.allHeads<=four.firstHead);assert.equal(four.firstHead,one.firstHead);
});
