p = Alice.pop;

aliceBlock = function(callback) {
  var thisRef = this;
  return function() {
    var blockMem = Alice.$block(true);
    callback.call(thisRef, blockMem);
    Alice.$blockEnd();
  }
}

aliceWord = function(word) {
  return pop(Alice.eval(word));
}

aliceWordEqual = function(word, val) {
  expect.equal(aliceWord(word), val);
}

aliceStackEqual = function(str) {
  expect.equal($block()._value.toString(), str);
}
