describe('parser', function() {
  describe('parse_token', function() {
    it('should split code into a value word, a parse word, and the remaining code', aliceBlock(function(blockMem) {

      Alice.exec('token', 'one+two');
      var code = p(), valueWord = p(), parseWord = p(), parseBlock = p();
      expect.equal(code, 'two');
      expect.equal(valueWord, 'one');
      expect.equal(parseWord, '+');
      expect.equal(typeof parseBlock, 'function');

      Alice.exec('token', 'one two three');
      var code = p(), valueWord = p(), parseWord = p(), parseBlock = p();
      expect.equal(code, 'two three');
      expect.equal(valueWord, 'one');
      expect.equal(parseWord, ' ');
      expect.equal(typeof parseBlock, 'function');
    }));
  });

  describe('parse', function() {
    it('should split code into value words seperated by parse words', aliceBlock(function(blockMem) {
      Alice.exec('parse', 'one two\tthree four');
      var _parse = Alice.$block()._parse;
      expect.equal(_parse.toString(), 'one,two,three,four');
    }));

    it('should call parse word blocks', aliceBlock(function(blockMem) {
      Alice.exec('parse', '1+1');
      expect.equal(blockMem._parse.toString(), '_+,1,1');
    }));

    it('the whitespace parse blocks should cause whitespace to be ignored', aliceBlock(function(blockMem) {
      Alice.exec('parse', '1 \t+\r 1');
      expect.equal(blockMem._parse.toString(), '_+,1,1');
    }));
  });
});

describe('executer', function() {
  it('should pop words off the _parse stack and push them onto the _value stack', aliceBlock(function(blockMem) {
    blockMem._parse = [1, 2, 3, 4];
    exec('execute');
    expect.equal(blockMem._value.toString(), '4,3,2,1');
  }));
  
  it('should lookup value definitions as values are popped of the stack, and execute them', aliceBlock(function(blockMem) {
    blockMem._parse = ['_+', 1, 1];
    Alice.exec('execute');
    expect.equal(blockMem._value.toString(), '2');
  }));

  it('should execute any code blocks found on the _parse stack', aliceBlock(function(blockMem) {
    var block = Alice.stackFunction(function(value) {
      exec('_push __', Number(value) + 1);
    });
    blockMem._parse = [block, 41];
    exec('execute');
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
      expect.equal(Number(Alice.execPop()), 42);
    }));
    it('should be able to assign blocks that span multiple lines', aliceBlock(function(blockMem) {
      Alice.eval('myVar = {\n\t20+22\n}');
      expect.equal(blockMem._value.length, 0);
      Alice.eval('myVar');
      expect.equal(Number(Alice.execPop()), 42);
    }));
  });

  describe('string blocks', function() {
    var stringA = 'the question is...';
    var stringB = 'this (might) be a bit cliche...\n...\n42';
    var stringC = 'bo""oooo\ny"yy"yy\naa\'aa""a!';

    it('should be able to quote strings with ""', aliceBlock(function(blockMem) {
      Alice.eval('"' + stringA + '"');
      expect.equal(Alice.execPop(), stringA);
      expect.equal(blockMem._value.length, 0);
    }));
    it('should be able to quote strings with multiple lines', aliceBlock(function(blockMem) {
      Alice.eval('"' + stringB + '"');
      expect.equal(Alice.execPop(), stringB);
      expect.equal(blockMem._value.length, 0);
    }));
    it('""" :) """', aliceBlock(function(blockMem) {
      Alice.eval('"""' + stringC + '"""');
      expect.equal(Alice.execPop(), stringC);
      expect.equal(blockMem._value.length, 0);
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
});
