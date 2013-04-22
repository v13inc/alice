var checkStack = function(str, stack) {
  expect.equal((stack || $block()._value).toString(), str);
}
var check42 = function(stack) { checkStack('42', stack) }

describe('helper functions', function() {
  it('should be able to return the keys from an object', function() {
    var obj = {one: 1, two: 2, three: 3};
    expect.equal(Alice.keys(obj).toString(), 'one,two,three');
  });

  it('should be able to loop forwards through lists with each', function() {
    var str = '';
    Alice.each([1, 2, 3, 4], function(i) {
      str += i;
    });
    expect.equal(str, '1234');
  });

  it('should be able to loop backwards through lists with each', function() {
    var str = '';
    Alice.each([1, 2, 3, 4], function(i) {
      str += i;
    }, true);
    expect.equal(str, '4321');
  });

  it('should be able to loop forwads through objects', function() {
    var obj = {one: 1, two: 2, three: 3};
    var str = '';
    Alice.each(obj, function(val, key) {
      str += key + ': ' + val + ' ';
    });
    expect.equal(str, 'one: 1 two: 2 three: 3 ');
  });

  it('should be able to loop backwards through objects', function() {
    var obj = {one: 1, two: 2, three: 3};
    var str = '';
    Alice.each(obj, function(val, key) {
      str += key + ': ' + val + ' ';
    }, true);
    expect.equal(str, 'three: 3 two: 2 one: 1 ');
  });

  it('should be able to map a function onto a list', function() {
    var str = each([1,2,3,4], function(i) { return i + '!' }).toString();
    expect.equal(str, '1!,2!,3!,4!');
  });

  it('should be able to generate a range', function() {
    expect.equal(range(1, 4).toString(), '1,2,3');
    expect.equal(range(4).toString(), '0,1,2,3');
  });
});

describe('execution levels', function() {
  it('should be able to "push" values onto the stack', aliceBlock(function(blockMem) {
    Alice.push(1, 2, 3, 4);
    checkStack('4,3,2,1');
  }));

  it('should be able to "call" words', aliceBlock(function(blockMem) {
    Alice.call('_+', 20, 22);
    check42();
  }));

  it('should be able to "run" expressions', aliceBlock(function(blockMem) {
    Alice.run('_+ 20 22');
    check42();
  }));

  it('should be able to pop "run" expressions', aliceBlock(function(blockMem) {
    var val = Alice.pop(Alice.run('_+ 20 22'));
    expect.equal(val, 42);
  }));
});

describe('parser', function() {
  describe('parse_token', function() {
    it('should split code into a value word, a parse word, and the remaining code', aliceBlock(function(blockMem) {

      Alice.call('token', 'one+two');
      var code = p(), valueWord = p(), parseWord = p(), parseBlock = p();
      expect.equal(code, 'two');
      expect.equal(valueWord, 'one');
      expect.equal(parseWord, '+');
      expect.equal(typeof parseBlock, 'function');

      Alice.call('token', 'one two three');
      var code = p(), valueWord = p(), parseWord = p(), parseBlock = p();
      expect.equal(code, 'two three');
      expect.equal(valueWord, 'one');
      expect.equal(parseWord, ' ');
      expect.equal(typeof parseBlock, 'function');
    }));
  });

  describe('parse', function() {
    it('should split code into value words seperated by parse words', aliceBlock(function(blockMem) {
      Alice.call('parse', 'one two\tthree four');
      var _parse = Alice.$block()._parse;
      expect.equal(_parse.toString(), 'one,two,three,four');
    }));

    it('should call parse word blocks', aliceBlock(function(blockMem) {
      Alice.call('parse', '1+1');
      expect.equal(blockMem._parse.toString(), '_+,1,1');
    }));

    it('the whitespace parse blocks should cause whitespace to be ignored', aliceBlock(function(blockMem) {
      Alice.call('parse', '1 \t+\r 1');
      expect.equal(blockMem._parse.toString(), '_+,1,1');
    }));
  });
});

describe('executer', function() {
  it('should pop words off the _parse stack and push them onto the _value stack', aliceBlock(function(blockMem) {
    blockMem._parse = [1, 2, 3, 4];
    Alice.call('execute');
    expect.equal(blockMem._value.toString(), '4,3,2,1');
  }));
  
  it('should lookup value definitions as values are popped of the stack, and execute them', aliceBlock(function(blockMem) {
    blockMem._parse = ['_+', 1, 1];
    Alice.call('execute');
    expect.equal(blockMem._value.toString(), '2');
  }));

  it('should execute any code blocks found on the _parse stack', aliceBlock(function(blockMem) {
    var block = Alice.stackFunction(function(value) {
      Alice.push(Number(value) + 1);
    });
    blockMem._parse = [block, 41];
    Alice.call('execute');
    expect.equal(blockMem._value.toString(), '42');
  }));
});

describe('eval', function() {
  it('should parse and execute basic values', aliceBlock(function(blockMem) {
    Alice.eval('1 2 3 4');
    expect.equal(blockMem._value.toString(), '4,3,2,1');
  }));

  it('should execute prefix functions', aliceBlock(function(blockMem) {
    Alice.eval('_+ 41 1');
    expect.equal(blockMem._value.toString(), '42');
  }));

  it('should execute infix functiosn', aliceBlock(function(blockMem) {
    Alice.eval('41 + 1');
    expect.equal(blockMem._value.toString(), '42');
  }));

  it('should be able to defer execution with a \'', aliceBlock(function(blockMem) {
    Alice.eval('world = 42');
    Alice.eval("'world");
    expect.equal(blockMem._value.toString(), 'world');
  }));
});

describe('base meta-library', function() {
  describe('code blocks', function() {
    it('should be able to create code blocks that execute immediately', aliceBlock(function(blockMem) {
      Alice.eval('(4*10)+(100/50)');
      expect.equal(blockMem._value.toString(), '42');
    }));
    it('should be able to create code blocks that do not execute immediately', aliceBlock(function(blockMem) {
      Alice.eval('{(4*10)+(100/50)}');
      expect.equal(typeof blockMem._value[0], 'function');
    }));
    it('should be able to execute deferred blocks on the stack', aliceBlock(function(blockMem) {
      Alice.eval('{(4*10)+(100/50)}');
      expect.equal(typeof blockMem._value[0], 'function');
      Alice.eval('!');
      expect.equal(blockMem._value.toString(), '42');
    }));
  });

  describe('assignment', function() {
    it('should be able to assign values to the _value stack with =', aliceBlock(function(blockMem) {
      Alice.eval('myVar = 42');
      expect.equal(blockMem.$value.myVar, '42');
    }));
    it('should be able to assign the result of () blocks', aliceBlock(function(blockMem) {
      Alice.eval('myVar = (42)');
      expect.equal(blockMem.$value.myVar, '42');
    }));
    it('should be able to assign the result of {} blocks for later evaluation', aliceBlock(function(blockMem) {
      Alice.eval('myVar = {(4*10)+(100/50)}');
      expect.equal(blockMem._value.length, 0);
      Alice.eval('myVar');
      expect.equal(Number(Alice.pop()), 42);
    }));
    it('should be able to assign blocks that span multiple lines', aliceBlock(function(blockMem) {
      Alice.eval('myVar = {\n\t20+22\n}');
      expect.equal(blockMem._value.length, 0);
      Alice.eval('myVar');
      expect.equal(Number(Alice.pop()), 42);
    }));
    it('should be able to pull values off the stack and assign them with a vairable block', aliceBlock(function(blockMem) {
      Alice.eval('one 2 "three four" 5*20; [a b c d]');
      aliceWordEqual('a', 'one');
      aliceWordEqual('b', '2');
      aliceWordEqual('c', 'three four');
      aliceWordEqual('d', '100');
    }));
  });

  describe('string blocks', function() {
    var stringA = 'the question is...';
    var stringB = 'this (might) be a bit cliche...\n...\n42';
    var stringC = 'bo""oooo\ny"yy"yy\naa\'aa""a!';

    it('should be able to quote strings with ""', aliceBlock(function(blockMem) {
      Alice.eval('"' + stringA + '"');
      expect.equal(Alice.pop(), stringA);
      expect.equal(blockMem._value.length, 0);
    }));
    it('should be able to quote strings with multiple lines', aliceBlock(function(blockMem) {
      Alice.eval('"' + stringB + '"');
      expect.equal(Alice.pop(), stringB);
      expect.equal(blockMem._value.length, 0);
    }));
    it('""" :) """', aliceBlock(function(blockMem) {
      Alice.eval('"""' + stringC + '"""');
      expect.equal(Alice.pop(), stringC);
      expect.equal(blockMem._value.length, 0);
    }));
    it('should be able to concatenate strings with ..', aliceBlock(function(blockMem) {
      Alice.eval('"one".."two" .."three four".. "five\nsix!" .. "!" ..thisWordDoesntExist..""');
      expect.equal(Alice.pop(), 'onetwothree fourfive\nsix!!thisWordDoesntExist');
    }));
  });

  describe('execute words', function() {
    it('should be able to execute deferred blocks with !', aliceBlock(function(blockMem) {
      Alice.eval('world = 42');
      Alice.eval("! 'world");
      expect.equal(blockMem._value.toString(), '42');
    }));

    it('should execute and keep blocks on the stack with !!', aliceBlock(function(blockMem) {
      Alice.eval('world = 42');
      Alice.eval("!! 'world");
      expect.equal(blockMem._value.length, 2);
    }));
  });

  describe('booleans and branching', function() {
    it('should be able to use the "false" word', aliceBlock(function(blockMem) {
      Alice.eval('false');
      expect.equal(Alice.pop(), false);
    }));

    it('should be able to use the "if" word', aliceBlock(function(blockMem) {
      Alice.eval('if true {"true value"}');
      expect.equal(Alice.pop(), "true value");
      $block(true);
      Alice.eval('if false {"true value"}');
      expect.equal(Alice.pop(), false);
      expect.equal(Alice.pop(), undefined);
      $blockEnd();
    }));

    it('should be able to use the onlyIf word', aliceBlock(function(blockMem) {
      Alice.eval('{"true value"} onlyIf true');
      expect.equal(Alice.pop(), "true value");
      $block(true);
        Alice.eval('{"true value"} onlyIf false');
        expect.equal(Alice.pop(), false);
        expect.equal(Alice.pop(), undefined);
      $blockEnd();
    }));
  });

  describe('looping', function() {
    var testList = [], mappedList = [], returnedList = [];
    var list = [1,2,3,4];
    var block = Alice.stackFunction(function(val) {
      testList.push(val);
      Alice.push(val);
    });
    var mapBlock = Alice.stackFunction(function(val) {
      testList.push(val);
      Alice.push(Number(val) * 2);
    });

    var check = function(a, b) {
      var a = a || '4,3,2,1';
      var b = b === undefined ? a : b;
      expect.equal(list.toString(), '1,2,3,4');
      expect.equal(testList.toString(), a);
      expect.equal(mappedList.toString(), b);
      expect.equal(returnedList.toString(), b)
    }
    var reset = function(blockMem) {
      testList = [], mappedList = [], returnedList = [];
      blockMem.$value.list = list;
      blockMem.$value.testList = testList;
    }

    describe('loop word', function() {
      it('should be able to loop backwards and forwards over a list', aliceBlock(function(blockMem) {
        reset(blockMem);
        Alice.deferCall('loop', list, block, 1, mappedList, false);
        returnedList = Alice.pop();
        check();

        reset(blockMem);
        Alice.deferCall('loop', list, block, 1, mappedList, true);
        returnedList = Alice.pop();
        check('1,2,3,4');
      }));

      it('should be able to map values onto a new list', aliceBlock(function(blockMem) {
        reset(blockMem);
        Alice.deferCall('loop', list, mapBlock, 1, mappedList, false);
        returnedList = Alice.pop();
        check('4,3,2,1', '8,6,4,2');

        reset(blockMem);
        Alice.deferCall('loop', list, mapBlock, 1, mappedList, true);
        returnedList = Alice.pop();
        check('1,2,3,4', '2,4,6,8');
      }));
    });

    describe('friendly loop words', function() {
      it('"each" should be able to loop backwards and forwards over a list', aliceBlock(function(blockMem) {
        reset(blockMem);
        Alice.eval('list each { testList push __ dup }');
        check('4,3,2,1', '');
      }));

      it('"foreach" should be able to loop backwards and forwards over a list', aliceBlock(function(blockMem) {
        reset(blockMem);
        Alice.eval('list foreach { testList push __ dup }');
        check('1,2,3,4', '');
      }));

      it('"times" should be able to repeat a block N times', aliceBlock(function(blockMem) {
        reset(blockMem);
        Alice.eval('4 times { testList push __ dup }');
        check('1,2,3,4', '');
      }));
    });
  });
});
