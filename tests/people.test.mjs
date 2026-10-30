import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialsFor } from '../src/lib/people.ts';

for (const [name, expected] of [
  ['Jo', 'JO'], ['  Sam   Lee ', 'SL'], ['Aleksandra Wiśniewska-Kowalczyk', 'AW'],
  ['🦊 Fox', '🦊F'], ['👩🏽‍💻 Priya', '👩🏽‍💻P'], ['王秀英', '王秀'],
  ['Đặng Thị Ngọc Hân', 'ĐH'], ['Christopher Alexander Montgomery III', 'CM'],
]) {
  test(`avatar initials preserve graphemes: ${name}`, () => {
    assert.equal(initialsFor({ full_name: name, email: 'unused@example.test' }), expected);
  });
}
test('missing names use the email local part, without domain initials', () => {
  assert.equal(initialsFor({ email: 'sam.lee@example.test' }), 'SL');
  assert.equal(initialsFor({ full_name: '  ', email: 'jo@example.test' }), 'JO');
  assert.equal(initialsFor({ email: '' }), '?');
});
