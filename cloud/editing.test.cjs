const test = require('node:test');
const assert = require('node:assert/strict');
const {editCode} = require('../source/studio/editing');

test('Enter continues indentation and splits matching braces with the caret inside', () => {
  const result = editCode('    {}\n', 5, 5, 'Enter');
  assert.equal(result.text, '    {\n        \n    }\n');
  assert.equal(result.start, 14);
  assert.equal(result.end, 14);
  assert.equal(editCode('    call()\n', 10, 10, 'Enter').text, '    call()\n    \n');
});

test('Tab indents the selection, excluding an unselected following line', () => {
  const result = editCode('one\ntwo\nthree\n', 0, 8, 'Tab');
  assert.equal(result.text, '    one\n    two\nthree\n');
  assert.equal(result.text.slice(result.start, result.end), 'one\n    two\n');
  const undone = editCode(result.text, result.start, result.end, 'Tab', true);
  assert.equal(undone.text, 'one\ntwo\nthree\n');
  assert.equal(undone.start, 0);
  assert.equal(undone.end, 8);
});

test('Shift+Tab removes one indentation level and bounds a caret inside whitespace', () => {
  const result = editCode('  one\n\ttwo\n', 1, 10, 'Tab', true);
  assert.equal(result.text, 'one\ntwo\n');
  assert.equal(result.start, 0);
  assert.equal(result.end, 7);
  assert.equal(editCode('\n', 0, 0, 'Tab').text, '    \n');
});
