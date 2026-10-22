const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const moduleCode=ts.transpileModule(fs.readFileSync('src/components/work/board-pan.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const moduleExports={};new Function('exports',moduleCode)(moduleExports);
global.window=new EventTarget();
const board=new EventTarget();board.style={cursor:'grab'};board.scrollLeft=200;const column={scrollTop:200};let capture=null;
board.setPointerCapture=id=>capture=id;board.hasPointerCapture=id=>capture===id;board.releasePointerCapture=()=>capture=null;
function send(type,extra={}){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'mouse',button:2,buttons:2,clientX:200,clientY:200,...extra});board.dispatchEvent(e);return e;}
board.addEventListener('pointerdown',e=>Object.defineProperty(e,'target',{value:{closest:()=>({querySelector:()=>column})}}));
const dispose=moduleExports.attachBoardPan(board);
send('pointerdown');send('pointermove',{clientX:150,clientY:120});assert.equal(board.scrollLeft,250);assert.equal(column.scrollTop,280);assert.equal(capture,1);send('pointerup');assert.equal(board.style.cursor,'grab');assert.equal(capture,null);
send('pointerdown',{button:0,buttons:1});send('pointermove',{clientX:100});assert.equal(board.scrollLeft,250);
for(const end of ['pointercancel','lostpointercapture']){send('pointerdown');send(end);assert.equal(board.style.cursor,'grab');}
send('pointerdown');window.dispatchEvent(new Event('blur'));assert.equal(capture,null);
send('pointerdown');send('pointermove',{buttons:0});assert.equal(capture,null);
send('pointerdown');dispose();assert.equal(capture,null);assert.equal(board.style.cursor,'grab');send('pointerdown');assert.equal(capture,null);
console.log('PASS: both axes, primary button exclusion, release, cancellation, capture loss, blur, missing button and unmount cleanup');
