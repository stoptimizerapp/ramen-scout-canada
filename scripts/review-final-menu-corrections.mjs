import fs from 'node:fs/promises';
const path = new URL('../data/search-readiness-menu-enrichments.json', import.meta.url);
const ledger = JSON.parse(await fs.readFile(path));
const rows = [
  ['Tonkotsu Ramen',19.25,['pork_bone'],[],['tonkotsu']],
  ['Spicy Tonkotsu Ramen',19.25,['pork_bone'],['spicy_other'],['tonkotsu']],
  ['Tonkotsu Black Garlic',19.25,['pork_bone'],[],['tonkotsu']],
  ['Miso Ramen',21.95,['pork_bone'],['miso'],[]],
  ['Spicy Miso Ramen',21.95,['pork_bone'],['miso','spicy_other'],[]],
  ['Shio Ramen',17.5,[],['shio'],[]],
  ['Shoyu Ramen',17.5,[],['shoyu'],[]],
  ['Chicken Shoyu',18.5,['chicken'],['shoyu'],[]],
  ['Chicken Shio',18.5,['chicken'],['shio'],[]],
];
const update = {
  restaurantId:'ramen_ca_ff25f125c395f1b05cb3', replacesMenuUrl:'https://shiawaseramen.ca/',menuUrl:'https://shiawaseramen.ca/menu.html',permanentItemCount:9,
  items:rows.map(([name,price,brothBase,tare,brothStyle])=>({name,price,brothBase,tare,brothStyle,servingStyle:['ramen'],dietary:[],evidenceRefs:['SR1']})),
  taxonomy:{tonkotsu:'yes',shoyu:'yes',miso:'yes',tsukemen:'unknown',brothBases:['pork_bone','chicken'],brothStyles:['tonkotsu'],tares:['shio','shoyu','miso','spicy_other'],servingStyles:['ramen'],evidenceRefs:['SR1']},
  prices:{observedCount:9,min:17.5,max:21.95,median:19.25,typical:19.25,band:'mid_range',evidenceRefs:['SR1']},
  content:{
    shortDescription:'Shiawase’s dedicated menu separates $17.50 clear-broth bowls, $18.50 chicken bowls and $19.25 tonkotsu; miso bowls cost $21.95. These are menu facts, not descriptions drawn from embedded customer reviews.',
    editorialDescription:'At Shiawase in Cameron Heights, the important distinction is between the regular clear-broth bowls and the specifically named chicken versions. Shio and Shoyu each cost $17.50 and include pork chashu, whereas Chicken Shio and Chicken Shoyu cost $18.50 and explicitly describe chicken broth and chicken chashu. Tonkotsu, Spicy Tonkotsu and Black Garlic all share a $19.25 price. Moving from that group to Miso or Spicy Miso adds $2.70; those bowls retain pork-bone broth and add a miso blend, pork and egg. The dedicated menu supports these choices directly without relying on the customer comments embedded on the homepage.',
    whatToOrder:'For chicken broth and chicken topping together, choose one of the explicitly named Chicken Shio or Chicken Shoyu bowls. For pork-bone soup at a fixed price, compare regular, spicy and black-garlic tonkotsu at $19.25. The clear-broth Shio and Shoyu contain pork topping, so their lower price does not imply a vegetarian recipe.',
    caveats:'The menu prominently asks guests to discuss peanuts with staff. No complete vegan bowl is established by the nine checked ramen entries. Mapo tofu ramen mentioned in a customer comment is not treated as a current menu item. Prices exclude any applicable tax, tip and add-ons; hours retain their separate source date.'
  }
};
const idx=ledger.records.findIndex(r=>r.restaurantId===update.restaurantId);
if(idx<0)ledger.records.push(update);else ledger.records[idx]=update;
const tasty=ledger.records.find(r=>r.restaurantId==='ramen_ca_5c9ac40ac8e5d19b9e8e');
tasty.content.editorialDescription='Tasty House’s six-bowl Japanese ramen section sits inside a wider Chinese and Japanese noodle menu. Its January 2026 menu images price Veggie Ramen at $17 and the five meat bowls at $19. That $2 difference is more useful than treating the whole restaurant as one price category. Tan Tan uses minced pork, Shoyu is paired with beef, and Miso with pork; Beef Tomato and Chicken Ramen provide alternatives to those three seasoning labels. A group can compare these named choices without assuming that all bowls have the same broth. The location is 11113 87 Avenue Northwest in Edmonton, with a separately sourced daily 11 a.m.–10 p.m. schedule.';
await fs.writeFile(path,JSON.stringify(ledger,null,2)+'\n');
