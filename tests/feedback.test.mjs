import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {isFeedbackRating,FEEDBACK_MAX_LENGTH} from "../src/lib/feedback.ts";

for(const value of [1,2,3,4,5])assert.equal(isFeedbackRating(value),true);
for(const value of [null,undefined,0,-1,6,1.5,NaN,Infinity,"5",true,{},[]])assert.equal(isFeedbackRating(value),false);
assert.equal(FEEDBACK_MAX_LENGTH,4000);
const db=new PGlite();
try{
  await db.exec("CREATE TABLE feedback(id integer PRIMARY KEY,message text NOT NULL); INSERT INTO feedback VALUES(1,'Original feedback');");
  const migration=await readFile(new URL("../src/db/migrations/084_feedback_rating.sql",import.meta.url),"utf8");
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT * FROM feedback WHERE id=1")).rows,[{id:1,message:"Original feedback",rating:null}]);
  await db.exec("INSERT INTO feedback(id,message,rating) VALUES(2,'Rated feedback',4)");
  await db.exec(migration);
  assert.equal((await db.query("SELECT rating FROM feedback WHERE id=2")).rows[0].rating,4);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM feedback")).rows[0].n,2);
  for(const locale of ["en","pl","de","es"]){
    const messages=JSON.parse(await readFile(new URL(`../messages/${locale}.json`,import.meta.url),"utf8"));
    for(const key of ["ratingLabel","ratingHint","ratingValue","ratingRequired","messageLabel"])assert.equal(typeof messages.feedback[key],"string");
    assert.ok(messages.feedback.ratingValue.includes("{rating}"));assert.ok(messages.admin.feedbackRating.includes("{rating}"));assert.equal(typeof messages.admin.feedbackUnrated,"string");
  }
  console.log("pass feedback rating validation, legacy migration preservation/retry and four locale catalogs");
}finally{await db.close();}
