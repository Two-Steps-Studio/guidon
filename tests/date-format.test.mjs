import assert from 'node:assert/strict';
import {formatCalendarDate} from '../src/lib/date.ts';

const iso='2024-01-02T00:00:00.000Z';
const previous=process.env.TZ;
try{
  for(const zone of ['UTC','America/Los_Angeles','Europe/Warsaw']){
    process.env.TZ=zone;
    for(const locale of ['en','pl','de','es']){
      const expected=new Intl.DateTimeFormat(locale,{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(iso));
      assert.equal(formatCalendarDate(iso,locale),expected,`${locale}/${zone}`);
    }
    assert.equal(formatCalendarDate(iso),formatCalendarDate(iso,'en'));
    assert.equal(formatCalendarDate('invalid-date','pl'),'');
  }
}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
console.log('pass explicit app locale and UTC calendar-day rendering across host timezones');
