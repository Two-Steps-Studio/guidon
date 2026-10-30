import assert from 'node:assert/strict';
import { test } from 'node:test';
import { squareCrop } from '../src/lib/image-crop.ts';

test('a square at 1x never exposes empty background at either slider extreme', () => {
  for (const x of [-100, 0, 100]) for (const y of [-100, 0, 100]) {
    const crop = squareCrop(100, 100, 1, x, y);
    assert.equal(crop.sx, 0);assert.equal(crop.sy, 0);assert.equal(crop.side, 100);
    assert.equal(parseFloat(crop.style.left), 0);assert.equal(parseFloat(crop.style.top), 0);
    assert.equal(crop.style.width, '100%');assert.equal(crop.style.height, '100%');
  }
});
test('landscape and portrait sliders reach their natural image boundaries', () => {
  assert.equal(squareCrop(200, 100, 1, -100, 0).sx, 0);
  assert.equal(squareCrop(200, 100, 1, 100, 0).sx, 100);
  assert.equal(squareCrop(100, 200, 1, 0, -100).sy, 0);
  assert.equal(squareCrop(100, 200, 1, 0, 100).sy, 100);
});
test('zoom retains the selected center and produces matching preview dimensions', () => {
  const { sx, sy, side, style } = squareCrop(100, 100, 2, 0, 0);
  assert.deepEqual({ sx, sy, side }, { sx: 25, sy: 25, side: 50 });
  assert.deepEqual(style, { width: '200%', height: '200%', left: '-50%', top: '-50%' });
});
test('out-of-range input is clamped and crops remain inside the source', () => {
  for (const [w,h] of [[640,480],[480,640],[64,64]]) for (const zoom of [-2,1,2,3,100]) for (const pos of [-200,-100,0,100,200]) {
    const crop = squareCrop(w,h,zoom,pos,-pos);
    assert.ok(crop.side > 0 && crop.sx >= 0 && crop.sy >= 0);
    assert.ok(crop.sx + crop.side <= w + 1e-8 && crop.sy + crop.side <= h + 1e-8);
  }
});
test('unloaded, invalid and nonfinite images cannot be exported', () => {
  assert.equal(squareCrop(0,100,1,0,0),null);
  assert.equal(squareCrop(100,-1,1,0,0),null);
  assert.equal(squareCrop(100,100,NaN,0,0),null);
  assert.equal(squareCrop(Infinity,100,1,0,0),null);
});
