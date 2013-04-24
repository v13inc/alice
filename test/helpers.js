p = Alice.pop;

aliceBlock = function(callback) {
  var thisRef = this;
  return function() {
    var blockMem = Alice.module(true);
    callback.call(thisRef, blockMem);
    Alice.moduleEnd();
  }
}

aliceWord = function(word) {
  return pop(Alice.eval(word));
}

aliceWordEqual = function(word, val) {
  expect.equal(aliceWord(word), val);
}

aliceStackEqual = function(str) {
  expect.equal(module()._value.toString(), str);
}
