const test = require('node:test');
const assert = require('node:assert/strict');
const {editCode, editLines} = require('../source/studio/editing');

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

test('line shortcuts preserve the code sentinel and exclude the following unselected line', () => {
  assert.deepEqual(editLines('one\ntwo\nthree\n', 4, 8, 'duplicate'), {text: 'one\ntwo\ntwo\nthree\n', start: 8, end: 12});
  assert.deepEqual(editLines('one\ntwo\nthree\n', 5, 5, 'up'), {text: 'two\none\nthree\n', start: 1, end: 1});
  assert.deepEqual(editLines('one\ntwo\nthree\n', 1, 1, 'down'), {text: 'two\none\nthree\n', start: 5, end: 5});
  assert.deepEqual(editLines('one\ntwo\nthree\n', 4, 8, 'delete'), {text: 'one\nthree\n', start: 4, end: 4});
  assert.equal(editLines('one\n', 1, 1, 'delete').text, '\n');
  assert.deepEqual(editLines('\n', 0, 0, 'duplicate'), {text: '\n\n', start: 1, end: 1});
});

test('selected code lines move together; boundary moves are no-ops', () => {
  assert.deepEqual(editLines('a\nb\nc\nd\n', 2, 6, 'up'), {text: 'b\nc\na\nd\n', start: 0, end: 4});
  assert.deepEqual(editLines('a\nb\nc\nd\n', 0, 4, 'down'), {text: 'c\na\nb\nd\n', start: 2, end: 6});
  assert.equal(editLines('a\nb\n', 0, 0, 'up').text, 'a\nb\n');
  assert.equal(editLines('a\nb\n', 2, 2, 'down').text, 'a\nb\n');
});
