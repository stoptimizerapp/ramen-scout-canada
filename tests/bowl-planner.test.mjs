import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { bowlSubtotal, filterBowls } from '../lib/bowl-planner.ts';
const bowl = {id:'a',restaurant:'Example',address:'10 Main St',city:'Toronto',name:'Miso',price:16.85,styles:['miso'],vegan:false,budgetEligible:true,context:''};
test('price ceilings exclude unknown and unresolved branch prices',()=>{
 const rows=[bowl,{...bowl,id:'b',price:undefined},{...bowl,id:'c',budgetEligible:false},{...bowl,id:'d',price:20}];
 assert.deepEqual(filterBowls(rows,'Toronto','miso','17').map(b=>b.id),['a']);
 assert.equal(filterBowls(rows,'','vegan','').length,0);
 assert.equal(filterBowls(rows,'','', '').length,4);
 assert.equal(filterBowls(rows,'','', 'invalid').length,0);
});
test('meal arithmetic uses cents and does not silently coerce missing values',()=>{
 assert.equal(bowlSubtotal(bowl,3),50.55);
 for(const quantity of [0,-1,1.5,13,NaN])assert.equal(bowlSubtotal(bowl,quantity),null);
 assert.equal(bowlSubtotal({...bowl,price:undefined},2),null);
 assert.equal(bowlSubtotal({...bowl,budgetEligible:false},2),null);
 assert.equal(bowlSubtotal({...bowl,price:NaN},2),null);
});
test('October factual corrections survive generation and keep branch menus separate',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../data/restaurants.json',import.meta.url)));
 for(const branch of r.filter(x=>/Ikkousha/.test(x.name))){
  assert.equal(branch.menu.items.length,9);
  const chicken=branch.name.includes('Chicken');
  assert.ok(branch.menu.url.endsWith(chicken?'/chickenmenu':'/tonkotsumenu'));
  assert.equal(branch.menu.items.some(x=>x.name==='Tori Black Ramen'),chicken);
  assert.ok(branch.menu.items.every(x=>!x.name.includes('$')));
 }
 const crafty=r.find(x=>x.name==='Crafty Ramen Guelph');
 assert.equal(crafty.prices.min,16.85);
 assert.ok(!crafty.menu.items.some(x=>/Mazemen/.test(x.name)));
 assert.ok(crafty.menu.items.some(x=>x.name==='Vampire Slayer'));
 const shia=r.find(x=>x.name==='Shiawase Ramen');
 assert.equal(shia.menu.items.length,11);
 assert.ok(shia.content.whatToOrder.includes('minced pork'));
});
