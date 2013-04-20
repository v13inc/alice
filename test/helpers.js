exec = Alice.exec;
p = Alice.execPop;

aliceBlock = function(callback) {
  var thisRef = this;
  return function() {
    var blockMem = Alice.$block(true);
    callback.call(thisRef, blockMem);
    Alice.$blockEnd();
  }
}
