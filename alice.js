var exports = exports || {};
var A = exports.Alice = {};

//
// Misc helpers
//

var each = function(list, callback) {
  for(var i in list) callback(list[i], i);
}

var map = function(list, callback) {
  var vals = [];
  each(list, function(l) { vals.push(callback(l)) });
  return vals;
}

var repeat = function(num, callback) {
  for(var i = 0; i < num; i++) callback(num);
}

var clone = function(obj) {
  if(obj == null || typeof obj != 'object') return obj;
  var copy = obj.constructor();
  for (var attr in obj) {
    if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
  }
  return copy;
}

var log_lists = function(lists, prefix) {
  var prefix = prefix ? prefix + ': ' : '';
  var logStrs = map(lists, function(list) {
    return list.join(', ');
  });
  console.log(prefix + logStrs.join(' | '));
}

var print_words_and_values = function(prefix) {
  log_lists([mem._words, mem._values], prefix);
}
var p = print_words_and_values;

//
// Stack-based function helper
//
//  In order to ease the bootstrapping process, we rely on using the stack
//  to pass arguments between functions, and avoid using the parent language
//  features as much as possible. This can make code pretty ugly -- this helper
//  cleans up the code by automatically popping the required number of values off
//  the stack and passing them to the supplied function.
//

var stackFunction = A.stackFunction = function(numArgs, callback) {
  return function() {
    var args = [];
    repeat(numArgs, function() { args.push(__.pop()); });

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

  wordBlock: {
    code: '',
    _value: [],
    _parse: [],
    $parse: {},
    $value: {},
  }
}

// this helper returns a reference to the current block memory, and allocates memory if needed
var $block = function(allocate) {
  if(allocate || mem._blocks.length == 0) {
    mem._blocks.push(clone(mem.wordBlock));
  }
  // return the block memory at the top of the _block stack
  return mem._block.slice(-1)[0];
}

var $blockEnd = function() {
  return mem._block.pop();
}

// 
// Parser and Executor
//

var token = A.token = function(line, delimiters) {
  // ensure delimeters is an array
  var delimiters = delimiters.push ? delimiters : [delimiters];

  var _token = function(delimiter) {
    var delIndex = line.indexOf(delimiter);
    if(delIndex == -1) return '';

    return line.substr(0, delIndex);
  }

  // grab tokens using all the delimiters, and return the shortest one
  var shortestWord;
  each(delimiters, function(delimiter) {
    var word = _token(delimiter);
    if(shortestWord === undefined) shortestWord = word;
    if(word && word.length < shortestWord.length) shortestWord = word;
  });

  // return the shortest word or the whole line, if no word was found
  return shortestWord || line;
}

var parser = A.parser = stackFunction(1, function(program) {
  if(program == '') return;

  // grab the next word
  var word = token(program, [' ', '\t', '\n']);
  var delimeter = program[word.length];

  // lookup possible parse and control character blocks
  var parseBlock = mem.p[word] || mem.$parse[word];
  var controlChar = mem.c[word[0]] || mem.libc[word[0]];
  var block = parseBlock || controlChar;

  // allow words with parse blocks to override control chars
  if(controlChar && !parseBlock) {
    // trim off the control char
    program = program.substr(1);
  } else {
    // trim the word from the program
    program = program.substring(word.length + 1);
  }

  // call the parse function if it exists
  if(block) {
    // we need to put the program back on the stack temporarily for the block.
    // also, the program needs to be off the stack when we call executer()
    __.push(program); block(); program = __.pop();
  } else {
    exec('_push', word, mem._words);
  }

  // start executing once we hit the end of the line, or the end of the program
  if(delimeter == '\n' || program == '') executer();

  __.push(program);
  parser();
});

var executer = A.executer = function() {
  var word = execPop('_pop', mem._words);

  // if the word is a block, execute it. Otherwise look it up in the variables
  if(typeof word == 'function' && !word.defer) {
    word();
  } else if(word) {
    var block = mem.v[word] || mem.$value[word];

    if(block) {
      // if we found a block, execute it or push it onto the _values stack
      typeof block == 'function' ? block() : __.push(block);
    } else {
      // we strip off the leading ', if it exists, which allows us to use 'myword to defer execution
      if(word.indexOf && word.indexOf("'") == 0) word = word.substr(1);
      // push the word onto __ as a literal value
      __.push(word);
    }

    executer();
  }
}

var execute = A.execute = function(program) {
  __.push(program.trim());
  parser();
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

// helper to call built-in lib words. To avoid chicken-and-egg problems, it calls the manipulates the 
// _values stack and calls the word block directly. Consequently, this helper only works with value words.
// This helper actually implements it's own (very) dumb parser.
var exec = A.exec = function() {
  // allocate a new block for this exec call
  $block(true);

  var _exec = function(words) {
    if(words.length == 0) return;

    var word = words.pop();
    if(typeof word == 'function') word();
    else $block()._values.push(word);
    _exec(words);
  }

  // copy over the arguments into a words array, splitting up any strings by spaces 
  var words = [];
  each(arguments, function(arg) { words = words.concat(arg.split ? arg.split(' ') : [arg]); });
  // replace any words with $value blocks, if available
  words = map(words, function(word) { return mem.$value[word] || word; });
  // recursively pop off words and execute them, or push them onto the _value stack
  _exec(words);

  $blockEnd();
}

// run exec and pop a value of the _values stack
var execPop = A.execPop = function() {
  exec.apply(this, arguments);
  return __.pop();
}

// Helper to create infix words (a MYWORD b)
var wordInfix = A.wordInfix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  // create a parse block to flip arguments
  var parseBlock = function() {
    var _parse = $block()._parse;
    exec('_push', valueWord, _parse); // push on the prefixed word to be called in the execute phase
    exec('_swap', _parse); // swap the first arg and the word to convert to prefix notation

    if(extraParseBlock) extraParseBlock();
  }

  mem.$value[valueWord] = block;
  mem.$parse[word] = parseBlock;
}

// Helper to create prefix words (MYWORD a b)
var wordPrefix = A.wordPrefix = function(word, block, extraParseBlock) {
  mem.$value[word] = block;
  if(extraParseBlock) mem.$parse[word] = extraParseBlock;
}

// Helper to create postfix words (a b MYWORD)
var wordPostfix = A.wordPostfix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  var parseBlock = stackFunction(1, function(code) {
    // insert the value word after the top 2 words on the _parse stack
    exec('_insert', valueWord, -3, $block()._parse);

    exec('_push', code, '__');

    if(extraParseBlock) extraParseBlock();
  });

  mem.$value[valueWord] = block;
  mem.$parse[word] = parseBlock;
}

// Helper to create parse words. Similar to wordPrefix, but without a value block by default
var wordParse = A.wordParse = function(word, block, extraValueBlock) {
  if(extraValueBlock) mem.$value[word] = extraValueBlock;
  mem.$parse[word] = block;
}

// helper to create parse functions that build blocks
var wordBlock = A.wordBlock = function(startWord, endWord, block) {
  var bracketToken = function(line, startWord, endWord, count) {
    var count = count || 0, token = '', character;
    do {
      character = line[token.length];
      token += character;

      if(character == startWord && startWord != endWord) count++;
      else if(character == endWord) count--;
    } while(count != 0);

    return token.slice(0, -1); // trim the final bracket off the token
  }

  wordParse(startWord, stackFunction(1, function(line) {
    // grab all the words until we hit the block end word
    var code = bracketToken(line, startWord, endWord, 1);
    exec('_push', code, '__');
    block();

    line = line.substring(code.length + 2); // strip the block from the remaining line
    exec('_push', line, '__');
  }));
}

// 
// Native words
//

// List Functions
wordPrefix('_', function() {
  exec('_push', [], '__');
});

wordInfix('len', stackFunction(1, function(list) {
  exec('_push', list.length, '__');
}));

wordInfix('push', stackFunction(2, function(list, item) {
  list.push(item);
}));

wordInfix('pop', stackFunction(1, function(list) {
  exec('_push', list.pop(), '__');
}));

wordInfix('drop', stackFunction(1, function(list) {
  list.pop();
}));

wordInfix('insert', stackFunction(3, function(list, index, item) {
  if(index < 0) index = list.length + index;
  list.splice(index - 1, 0, item);
}));

wordInfix('set', stackFunction(3, function(list, index, item) {
  if(index < 0) index = list.length + index;
  list[index - 1] = item;
}));

wordInfix(':', stackFunction(2, function(list, index) {
  exec('_push', list[index - 1], '__');
}));

wordInfix('swap', stackFunction(1, function(list) {
  var a = execPop('_pop', list);
  var b = execPop('_pop', list);
  exec('_push', a, list);
  exec('_push', b, list);
}));

wordInfix('dup', stackFunction(1, function(list) {
  list.push(list.slice(-1)[0]);
}));

// Functions to manipulate block stacks and dictionaries
wordPrefix('__', function() {
  // push a reference to the current _value stack onto _values (meta!)
  // NOTE: _push relies on this word, so we have to push manually (poor DRY)
  $block()._value.push($block()._value);
});

// = adds a word to $value
wordInfix('=', stackFunction(2, function(word, block) {
  $block().$value[word] = block;
}), function() {
  var _parse = $block()._parse;
  // add a ' to the first argument, so we can overwrite existing words
  var a = execPop('_pop', _parse);
  exec('_push', "'" + a, _parse);
});

// Math functions
wordInfix('+', stackFunction(2, function(a, b) {
  exec('_push', Number(a) + Number(b), '__'); 
}));

wordInfix('-', stackFunction(2, function(a, b) {
  exec('_push', Number(a) - Number(b), '__'); 
}));

wordInfix('*', stackFunction(2, function(a, b) {
  exec('_push', Number(a) * Number(b), '__'); 
}));

wordInfix('/', stackFunction(2, function(a, b) {
  exec('_push', Number(a) / Number(b), '__'); 
}));

wordInfix('%', stackFunction(2, function(a, b) {
  exec('_push', Number(a) % Number(b), '__'); 
}));

wordPrefix('print', stackFunction(1, function(item) {
  console.log(item);
}));

// ! executes the block on the top of the _values stack
wordPrefix('!', stackFunction(1, function(word) {
  block = typeof word == 'function' ? word : mem.v[word] || mem.$value[word];
  if(typeof block == 'function') block();
}));

// !! is like !, but keeps the block on the stack
wordPrefix('!!', stackFunction(0, function() {
  exec('_dup __');
  mem.$value['!']();
}));

// " quotes strings and stops them from being parsed.
wordBlock('"', '"', stackFunction(1, function(code) { exec('_push', code, mem._words) }));
// () executes immediately
wordBlock('(', ')', stackFunction(1, function(code) { exec('_push', codeBlock(code), mem._words) }));
// {} defers execution until later
wordBlock('{', '}', stackFunction(1, function(code) { exec('_push', codeBlock(code, true), mem._words) }));

execute('(1+1)');
