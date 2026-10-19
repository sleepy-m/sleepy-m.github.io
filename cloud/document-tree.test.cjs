const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={window:{}};vm.runInNewContext(fs.readFileSync('source/studio/document-tree.js','utf8'),scope);const T=scope.window.StudioDocumentTree;
const doc=(id,parent=null)=>({id,title:id,body:T.stamp('正文',id,parent)});
test('parent relations survive body serialization and editor whitespace',()=>{const d=doc('child','parent');assert.equal(T.id(d),'child');assert.equal(T.parent(d),'parent');assert.equal(T.parent({...d,id:'different-api-id'}),'parent');assert.equal(T.stamp(d.body,'child',null).match(/studio-document/g).length,1);});
test('tree nests children and grandchildren',()=>{const tree=T.forest([doc('a'),doc('b','a'),doc('c','b')]);assert.equal(tree.length,1);assert.equal(tree[0].children[0].children[0].doc.id,'c');});
test('orphan and cyclic documents remain visible',()=>{assert.equal(T.forest([doc('x','missing')]).length,1);assert.equal(T.forest([doc('a','b'),doc('b','a')]).length,2);});
test('self and descendants cannot be chosen as parents',()=>{const a=doc('a'),b=doc('b','a'),c=doc('c','b');assert.deepEqual([...T.descendants(a,[a,b,c])].sort(),['a','b','c']);});
test('conflict backups with duplicated document IDs remain visible',()=>{const a=doc('a'),backup={...a,id:'backup',title:'备份'};assert.equal(T.forest([a,backup]).length,2);});
