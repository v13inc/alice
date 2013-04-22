var exports = exports || {};
var Alice = exports.Alice = {};
var A = Alice; // I'm lazy!

//
// Misc helpers
//

var keys = A.keys = function(obj) {
  var _keys = [];
  for(var key in obj) if(obj.hasOwnProperty(key)) _keys.push(key);
  return _keys;
}

var each = A.each = function(list, callback, reverse) {
  // let's shoehorn some map functionality in here too
  var newList = [];
  // recursively pop values off the bottom of the list (to simulate old-school loop order)
  var _each = function(_keys) {
    if(_keys.length <= 0) return;

    var key = reverse ? _keys.slice(-1)[0] : _keys[0];
    newList.push(callback(list[key], key));

    _each(reverse ? _keys.slice(0, -1) : _keys.slice(1));
  }
  _each(keys(list));
  
  return newList;
}

// returns a list of numbers ranging from start to end, or 0 to start, if end isn't passed
var range = A.range = function(start, end) {
  var rangeList = [], start = Number(start), end = Number(end);
  var _range = function(start, end) {
    if(start >= end) return;
    rangeList.push(start);
    _range(start + 1, end);
  }
  _range(end ? start : 0, end ? end : start);

  return rangeList;
}

var log_lists = function(lists) {
  var logStrs = each(lists, function(list) { return list.join(', '); });
  console.log(logStrs.join(' | '));
}

var print_words_and_values = function() {
  log_lists([$block()._parse, $block()._value]);
}
pw = print_words_and_values; // this totally comes in handy

//
// Type convertors
//

// grumble, grumble, arguments....
var toArray = function(list) {
  return Array.prototype.slice.call(list, 0);
}

var toBlock = function(block) {
  if(typeof block == 'function') return block; // already a block

  // TODO: get that fancy block thing working ;)
  // if the block isn't an array, wrap it so we can 'apply' it to the execLevel function
  // this lets you do this: toBlock(['_push', myFancyArray, myDancyValue])
  return function() { 
    run(block);
  };
}

//
// Stack-based function helper
//
//  In order to ease the bootstrapping process, we rely on using the stack
//  to pass arguments between functions, and avoid using the parent language
//  features as much as possible. This can make code pretty ugly -- this helper
//  cleans up the code by automatically popping the required number of values off
//  the stack and passing them to the supplied function.
//

var stackFunction = A.stackFunction = function(callback) {
  return function() {
    var block = $block();
    var args = [];
    each(range(callback.length), function() { args.push(block._value.pop()); });

    callback.apply(this, args);
  }
}

//
// Data structures
//

var mem = A.mem = {
  _block: [],
  // built-in dictionaries
  $parse: {}, // parse words
  $value: {}, // value words
}

// this helper returns a reference to the current block memory, and allocates memory if needed
var $block = A.$block = function(allocate) {
  if(allocate || mem._block.length == 0){
    mem._block.push({
      _value: [],
      _parse: [],
      $parse: {},
      $value: {},
    });
  }
  // return the block memory at the top of the _block stack
  return mem._block.slice(-1)[0];
}

var $blockEnd = A.$blockEnd = function() {
  return mem._block.pop();
}

//
// Execution levels
//  push => call => run => eval
//  push: pushes arguments onto the stack
//  call: pushes arguments and executes words and blocks
//   - deferCall: this is a helper that defers all but the first argument
//  run: splits arguments into words, then pushes and calls 'em
//  eval: evaluate code using the fully boostrapped parser and executor
//

var push = A.push = function() {
  var _value = $block()._value;
  each(arguments, function(arg) { _value.push(arg) }, true); // reverse each
}

var pop = A.pop =function() {
  return $block()._value.pop();
}

var callWord = A.callWord = function(word) {
  var block = typeof word == 'function' ? word : mem.$value[word];

  // there is a terrible javascript WAT?!? where you can look up a key with an array of that key
  // so we must check to see if the word is an array-like object
  //  eg. myDict = {one: 1}; myDict['one'] == myDict[['one']];
  if(block && !isDeferred(block) && typeof word != 'object') {
    block();
  } else {
    $block()._value.push(undefer(word));
  }
}

// push words onto the stack like "push", except call any blocks or built-in words
var call = A.call = function() {
  each(arguments, function(word) { callWord(word) }, true); // reverse
}

// like call, except it defers all but the first argument
var deferCall = A.deferCall = function() {
  var args = each(arguments, function(arg, i) { return i == 0 ? arg : defer(arg); });
  call.apply(this, args);
}

// like call, except it will split up any strings into a flat arguments array
var run = A.run = function() {
  // split up any strings in the arguments and concat them into a flat array
  var args = [];
  each(arguments, function(arg) {
    arg = (arg && arg.split) ? arg.split(' ') : [arg];
    args = args.concat(arg);
  });
  
  call.apply(this, args);
}

var evaluate = A.eval = function(code) { deferCall('eval', code); }
e = evaluate; // let's pollute the globals just a bit more for convenience

// 
// Defer functions
//
// These functions are used to work with deferred words and blocks. If a deferred word or block
// is found by the executor, it will be undeferred instead of executed. If a word or block is
// deferred multiple times, it will have to be undeferred multiple times before it will be executed.
//

var defer = A.defer = function(obj) {
  var quotable = {string: '', number: ''};
  var deferrable = {'function': '', object: ''};
  // keep a count of how many times a function has been deferred
  if(typeof obj in deferrable) obj.defer = obj.defer ? obj.defer + 1 : 1;
  else if(typeof obj in quotable) obj = "'" + obj;

  return obj
}

var undefer = A.undefer = function(obj) {
  if(isDeferred(obj)) {
    var deferrable = {'function': '', object: ''};
    if(typeof obj in deferrable && obj.defer > 0) obj.defer--;
    else obj = obj.substr(1);
  }

  return obj
}

var isDeferred = A.isDeferred = function(obj) {
  if(!obj) return false;

  // use !! to cast to a boolean
  return !!(obj.defer || (obj.indexOf && obj.indexOf("'") == 0));
}


//
// Word helpers
//
// These helpers abstract away the concept of parse and value words, and let you simply
// create infix, postfix and prefix words. All of the arguments are reordered in the parse
// phase into prefix-style value words. 
//
// Eg:
//  2 + 2 ` original infix line before parse phase
//  + 2 2 ` reordered prefix line after parse phase
//

// Helper to create infix words (a MYWORD b)
var wordInfix = A.wordInfix = function(word, numLeftWords, block, extraParseBlock) {
  // if numLeftWords isn't passed, use 1
  if(typeof numLeftWords != 'number') {
    var extraParseBlock = block, block = numLeftWords, numLeftWords = 1;
  }

  var valueWord = '_' + word;
  // create a parse block to flip arguments
  var parseBlock = stackFunction(function(code) {
    // insert the value word after the top numLeftWords on the _parse stack
    run('_insert __p', -numLeftWords, defer(valueWord));

    push(code);
    if(extraParseBlock) call(toBlock(extraParseBlock));
  })

  mem.$value[valueWord] = toBlock(block);
  mem.$parse[word] = parseBlock;
}

// Helper to create prefix words (MYWORD a b)
var wordPrefix = A.wordPrefix = function(word, block, extraParseBlock) {
  mem.$value[word] = toBlock(block);
  if(extraParseBlock) mem.$parse[word] = toBlock(extraParseBlock);
}

// Helper to create postfix words (a b MYWORD)
var wordPostfix = A.wordPostfix = function(word, numLeftWords, block, extraParseBlock) {
  // if numLeftWords isn't passed, use 1
  if(typeof numLeftWords != 'number') {
    var extraParseBlock = block, block = numLeftWords, numLeftWords = 1;
  }

  var valueWord = '_' + word;
  var parseBlock = stackFunction(function(code) {
    // insert the value word after the top 2 words on the _parse stack
    run('_insert __p', -numLeftWords, defer(valueWord));

    push(code);
    if(extraParseBlock) call(toBlock(extraParseBlock));
  });

  mem.$value[valueWord] = toBlock(block);
  mem.$parse[word] = parseBlock;
}

// Helper to create parse words. Similar to wordPrefix, but without a value block by default
var wordParse = A.wordParse = function(word, block, extraValueBlock) {
  if(extraValueBlock) mem.$value[word] = toBlock(extraValueBlock);
  mem.$parse[word] = toBlock(block);
}

// helper to create parse functions that build blocks
var wordBlock = A.wordBlock = function(startWord, endWord, block, noAllocate) {
  var bracketToken = function(code, startWord, endWord, count) {
    var count = count || 0, token = '', character;
    // TODO: Recursion, baby
    do {
      token += code[token.length];
      var matchesStart = token.substr(-startWord.length) == startWord;
      var matchesEnd = token.substr(-endWord.length) == endWord;

      if(matchesStart && startWord != endWord) count++;
      else if(matchesEnd) count--;
    } while(count != 0);

    return token.slice(0, -endWord.length); // trim the final bracket off the token
  }

  wordParse(startWord, stackFunction(function(line) {
    // grab all the words until we hit the block end word
    var code = bracketToken(line, startWord, endWord, 1);
    deferCall(toBlock(block), code);

    line = line.substring(code.length + endWord.length); // strip the block from the remaining line
    push(line);
  }));
}

// 
// Parser and Executor
//

wordPrefix('parse_token', stackFunction(function(code, valueWord) {
  if(code == '') return push(code, valueWord, '', null);

  var definition = function(word) {
    var block = pop(deferCall('definition', '$parse', word));
    // we can't use run, in case word is a space
    var valueBlock = pop(deferCall('definition', '$value', word));
    return { value: valueBlock == word ? null : valueBlock, parse: block == word ? null : block };
  }

  var lookup = function(word) {
    if(!word) return;

    var block = definition(word);
    // if the current word has a value definition, return immediately. This lets value words
    // have parse words in them (eg. _+)
    if(block.value) return;
    if(block.parse) return lookupLongest(word, block.parse);

    return lookup(word.slice(1));
  }

  // once we have found a matching parse word, we do another search for longer matching parse words
  var lookupLongest = function(word, block) {
    var similiarWords = pop(deferCall('definition_search', '$parse', word));
    // look for the longest parse word that matches up with the code
    var longestMatch = { word: word, block: block, trimExtra: 0 };
    each(similiarWords, function(simWord) {
      if(code.indexOf(simWord) == 0 && simWord.length > longestMatch.word.length) {
        var block = definition(simWord);
        if(!block.value && block.parse) longestMatch = { word: simWord, block: block.parse, trimExtra: simWord.length - word.length };
      }
    });

    return longestMatch;
  }

  valueWord += code[0];
  var match = lookup(valueWord);
  if(match) {
    valueWord = valueWord.substr(0, valueWord.length - match.word.length);
    push(code.slice(1 + match.trimExtra), valueWord, match.word, match.block);
  } else {
    deferCall('parse_token', code.slice(1), valueWord);
  }
}));

wordPrefix('token', stackFunction(function(code) { deferCall('parse_token', code, ''); }));

wordPrefix('parse', stackFunction(function(code) {
  if(!code) return;

  // grab the next set of value and parse words
  deferCall('token', code);
  var code = pop(), valueWord = pop(), parseWord = pop(), parseBlock = pop();

  // push the valueWord onto _parse
  if(valueWord) run('_push __p', defer(valueWord));
  // call the parse block, if available
  if(parseBlock) code = pop(deferCall(parseBlock, code));

  deferCall('parse', code);
}));

wordPrefix('execute', function() {
  if(pop(run('_len __p')) <= 0) return;

  run('execute ! _pop __p');
});

wordPrefix('eval', 'execute parse');

// helper words to look up definitions. Type is one of $parse or $value
wordPrefix('definition', stackFunction(function(type, word) {
  var block;
  // concat mem to the beginning of _block so we search mem first
  each([mem].concat(mem._block), function(blockMem) { block = blockMem[type][word] || block });
  push(block || word);
}));

// find all parse words that start with <search> (eg. definition_search " => [", """])
wordPrefix('definition_search', stackFunction(function(type, search) {
  var matches = [];
  each([mem].concat(mem._block), function(blockMem) {
    each(blockMem[type], function(block, word) {
      if(word.indexOf(search) == 0) matches.push(word);
    });
  });
  push(matches);
}));


// 
// Syntax words
//

// no-op word
wordPrefix('pass', function() {});

// Functions to manipulate block stacks and dictionaries
wordPrefix('__', function() { push($block()._value) });
wordPrefix('__p', function() { push($block()._parse) });
wordPrefix('__b', function() { push(mem._block) });

// = adds a word to $value
wordInfix('=', stackFunction(function(word, block) {
  $block().$value[word] = block;
}), function() {
  // defer the first argument so we can overwrite existing words
  var a = pop(run('_pop __p'));
  run('_push __p', defer(defer(a)));
});

// ! executes the block on the top of the _values stack
wordPrefix('!', stackFunction(function(word) {
  call(pop(deferCall('definition', '$value', word)));
}));

// !p executes the parse block for word
wordPrefix('!p', stackFunction(function(word) {
  call(pop(deferCall('definition', '$parse', word)));
}));

wordPrefix('!!', '! _dup __');

// code block factories
wordPrefix('()', stackFunction(function(code) {
  push(function() { deferCall('eval', code) });
}));

wordPrefix('{}', stackFunction(function(code) {
  // call the regular block factory, and defer it's output
  push(defer(pop(call('()', code))));
}));

wordPrefix('[]', stackFunction(function(code) {
  var words = code.split(' ');
  each(words, function(word) { deferCall('_=', word, pop()) });
}));

wordPrefix('""', stackFunction(function(code) {
  push(defer(code));
}));

// " quotes strings and stops them from being parsed.
wordBlock('"', '"', '_push __p ""');
wordBlock('"""', '"""', '_push __p');
// () executes immediately
wordBlock('(', ')', '_push __p ()');
// {} defers execution until later
wordBlock('{', '}', '_push __p {}');
// [var1, var2, ...] pops values off the stack and defines them
wordBlock('[', ']', '_push __p []');

// void word separators
wordParse(' ', 'pass');
wordParse('\t', 'pass');
wordParse('\r', 'pass');

// execute on newlines
wordParse('\n', stackFunction(function(code) { call(defer(code), 'execute') }));
wordParse(';', stackFunction(function(code) { call(defer(code), 'execute') }));

// 
// Strings
// 

wordInfix('..', stackFunction(function(left, right) { 
  push(left.toString() + right.toString());
}));
// 
// Booleans and branching
//

// any value is can be true, but only false can be false. - Steve Jobs, 1998
wordPrefix('false', function() { push(false) });
wordPrefix('not', stackFunction(function(val) { push(!val) }));
wordPrefix('if', stackFunction(function(bool, block) {
  push(bool);
  if(bool !== false) call('!', block);
}));
wordInfix('onlyIf', function() { run('if _swap __') }); // infix version
wordInfix('else', 'if not');

// 
// Looping
//

// big-ass generic loop recursor, loops backward from default (it's more stack friendly)
wordPrefix('loop', stackFunction(function(list, block, index, newList, forward) {
  var len = pop(deferCall('_len', list));
  var index = Number(index);
  if(index > len) return push(newList); // push the list on the stack so we can chain

  // use a negative index if we are traversing in reverse
  var trueIndex = forward ? index : (len - index + 1);
  // push the list, index and value on the stack
  deferCall('_get', list, trueIndex,   trueIndex, list);
  deferCall('!', block);
  // replace the list value with the one on the stack
  var newVal = pop(); pop(); pop(); // grab the new value and discard the index and list
  deferCall('_push', newList, newVal);

  deferCall('loop', list, block, index + 1, newList, forward);
}));

// __ each {[value, index, list] pass }
wordInfix('each', stackFunction(function(list, block) {
  deferCall('loop', list, block, 1, [], false);
}));

wordInfix('foreach', stackFunction(function(list, block) {
  deferCall('loop', list, block, 1, [], true);
}));

wordInfix('times', stackFunction(function(numTimes, block) {
  deferCall('loop', range(1, Number(numTimes) + 1), block, 1, [], true);
}));

// 
// List words
//

wordPrefix('_', function() { push([]) });
wordInfix('len', stackFunction(function(list) { 
  push(list.length);
}));
wordInfix('push', stackFunction(function(list, item) { list.push(item) }));
wordInfix('pop', stackFunction(function(list) { push(list.pop()) }));
wordInfix('drop', stackFunction(function(list) { list.pop() }));
wordInfix('insert', stackFunction(function(list, index, item) {
  if(index <= 0) index = list.length + index + 1; // support negative indexing
  list.splice(index - 1, 0, item);
}));
wordInfix('set', stackFunction(function(list, index, item) {
  if(index < 0) index = list.length + index + 1; // support negative indexing
  list[index - 1] = item;
}));
wordInfix('get', stackFunction(function(list, index) { 
  if(index < 0) index = list.length + index + 1; // support negative indexing
  push(list[index - 1]);
}));
wordInfix('swap', stackFunction(function(list) { run('_insert', defer(list), -1, '_pop', defer(list)) }));
wordInfix('dup', stackFunction(function(list) { list.push(list.slice(-1)[0]) }));

// 
// Math words
//

wordInfix('+', stackFunction(function(a, b) { push(Number(a) + Number(b)); }));
wordInfix('-', stackFunction(function(a, b) { push(Number(a) - Number(b)); }));
wordInfix('*', stackFunction(function(a, b) { push(Number(a) * Number(b)); }));
wordInfix('/', stackFunction(function(a, b) { push(Number(a) / Number(b)); }));
wordInfix('%', stackFunction(function(a, b) { push(Number(a) % Number(b)); }));
wordPrefix('print', stackFunction(function(item) { console.log(item); }));


// create the root-level block
$block();
