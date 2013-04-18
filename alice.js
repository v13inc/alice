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

var codeBlock = A.codeBlock = function(code, defer) {
  var block = function() { execute(code); };
  block.defer = defer;
  return block;
}

//
// Data structures
//

var mem = A.mem = {
  // _stacks
  _values: [],
  _words: [],

  // run-time dictionaries
  v: {}, // value
  p: {}, // parse

  // built-in value words
  libv: {},
  // built-in parse words
  libp: {},
}

// store a reference to the values stack, since we use it all the time
var __ = mem._values;

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
  var lastWord = word.length == program.length;
  // trim the word from the program
  program = program.substring(word.length + 1);
  // call the parse function if it exists
  var p_block = mem.p[word.trim()] || mem.libp[word.trim()];
  if(p_block) {
    // we need to put the program back on the stack temporarily for the parse block.
    // also, the program needs to be off the stack when we call executer()
    __.push(program); p_block(); program = __.pop();
  } else {
    // push word onto the _words list
    $exec('_push', word, mem._words);
  }

  // start executing once we hit the end of the line, or the end of the program
  if(delimeter == '\n' || program == '') executer();

  __.push(program);
  parser();
});

var executer = A.executer = function() {
  var word = $execPop('_pop', mem._words);

  // if the word is a block, execute it. Otherwise look it up in the variables
  if(typeof word == 'function' && !word.defer) {
    word();
  } else if(word) {
    var block = mem.v[word] || mem.libv[word];

    if(block) {
      // if we found a block, execute it or push it onto the _values stack
      typeof block == 'function' ? block() : __.push(block);
    } else {
      // push the word onto __ as a literal value, and remove the leading ', if needed
      if(word.indexOf && word.indexOf("'") == 0) word = word.substr(1);
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
var $exec = A.$exec = function() {
  var word = Array.prototype.shift.apply(arguments);
  for(var i in arguments) {
    __.push(arguments[i]);
  }

  mem.libv[word]();
}

// run exec and pop a value of the _values stack
var $execPop = A.$execPop = function() {
  $exec.apply(this, arguments);
  return __.pop();
}

// Helper to create infix words (a MYWORD b)
var $infix = A.$infix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  // create a parse block to flip arguments
  var parseBlock = function() {
    $exec('_push', valueWord, mem._words); // push on the prefixed word to be called in the execute phase
    $exec('_swap', mem._words); // swap the first arg and the word to convert to prefix notation

    if(extraParseBlock) extraParseBlock();
  }

  mem.libv[valueWord] = block;
  mem.libp[word] = parseBlock;
}

// Helper to create prefix words (MYWORD a b)
var $prefix = A.$prefix = function(word, block, extraParseBlock) {
  mem.libv[word] = block;
  if(extraParseBlock) mem.libp[word] = extraParseBlock;
}

// Helper to create postfix words (a b MYWORD)
var $postfix = A.$postfix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  var parseBlock = stackFunction(1, function(line) {
    // insert the value word after the top 2 words on the _words list
    $exec('_insert', valueWord, -3, mem._words);

    __.push(line);

    if(extraParseBlock) extraParseBlock();
  });

  mem.libv[valueWord] = block;
  mem.libp[word] = parseBlock;
}

// Helper to create parse words. Similar to $prefix, but without a value block by default
var $parse = A.$parse = function(word, block, extraValueBlock) {
  if(extraValueBlock) mem.libv[word] = extraValueBlock;
  mem.libp[word] = block;
}

// helper to create parse functions that build blocks
var $block = A.$block = function(startWord, endWord, defer, extraParseBlock) {
  var bracketToken = function(line, startWord, endWord, count) {
    var count = count || 0, token = '', character;
    do {
      character = line[token.length];
      token += character;

      if(character == startWord) count++;
      else if(character == endWord) count--;
    } while(count != 0);

    return token.slice(0, -1); // trim the final bracket off the token
  }

  $parse(startWord, stackFunction(1, function(line) {
    // grab all the words until we hit the block end word
    var code = bracketToken(line, startWord, endWord, 1);
    line = line.substring(code.length + 2); // strip the block from the remaining line

    // add the code block to the _words list
    $exec('_push', codeBlock(code, defer), mem._words);

    __.push(line);

    if(extraParseBlock) extraParseBlock();
  }));
}

// 
// Native words
//

// List Functions
$prefix('_', function() {
  $exec('_push', [], __);
});

$infix('len', stackFunction(1, function(list) {
  $exec('_push', list.length, __);
}));

$infix('push', stackFunction(2, function(list, item) {
  list.push(item);
}));

$infix('pop', stackFunction(1, function(list) {
  $exec('_push', list.pop(), __);
}));

$infix('drop', stackFunction(1, function(list) {
  list.pop();
}));

$infix('insert', stackFunction(3, function(list, index, item) {
  if(index < 0) index = list.length + index;
  list.splice(index - 1, 0, item);
}));

$infix('set', stackFunction(3, function(list, index, item) {
  if(index < 0) index = list.length + index;
  list[index - 1] = item;
}));

$infix(':', stackFunction(2, function(list, index) {
  $exec('_push', list[index - 1], __);
}));

$infix('swap', stackFunction(1, function(list) {
  var a = $execPop('_pop', list);
  var b = $execPop('_pop', list);
  $exec('_push', a, list);
  $exec('_push', b, list);
}));

// easy reference to _values and _words
$prefix('__', function() { __.push(mem._values) });
$prefix('_w', function() { __.push(mem._words) });

// = adds a word to libv
$infix('=', stackFunction(2, function(word, block) {
  mem.v[word] = block;
}), function() {
  // add a ' to the first argument, so we can overwrite existing words
  var a = $execPop('_pop', mem._words);
  $exec('_push', "'" + a, mem._words);
});

// Math functions
$infix('+', stackFunction(2, function(a, b) {
  __.push(Number(a) + Number(b)); 
}));

$infix('-', stackFunction(2, function(a, b) {
  __.push(Number(a) - Number(b)); 
}));

$infix('*', stackFunction(2, function(a, b) {
  __.push(Number(a) * Number(b)); 
}));

$infix('/', stackFunction(2, function(a, b) {
  __.push(Number(a) / Number(b)); 
}));

$infix('%', stackFunction(2, function(a, b) {
  __.push(Number(a) % Number(b)); 
}));

$prefix('print', stackFunction(1, function(item) {
  console.log(item);
}));

// ! executes the block on the top of the _values stack
$prefix('!', stackFunction(1, function(word) {
  if(typeof word == 'function') {
    var block = word;
  } else {
    // lookup the word
    block = mem.v[word] || mem.libv[word];
  }

  if(typeof block == 'function') block();
}));

// !! is like !, but keeps the block on the stack
$prefix('!!', stackFunction(1, function(block) {
  __.push(block); __.push(block);
  mem.libv['!']();
}));

// ' defers the next word from executing
$parse("'", stackFunction(1, function(line) {
  __.push("'" + line.trim());
}));

// " quotes strings and stops them from being parsed.
$parse('"', stackFunction(1, function(line) {
  // grab all the text until the ending quote
  var str = token(line, '"');
  var line = line.substring(str.length + 2).trim();

  // push the quoted string onto _words
  $exec('_push', str, mem._words);

  __.push(line);
}));

// setup our code block words
$block('(', ')'); // immediate execution
$block("'(", ')', true); // defer execution
$block('{', '}', true); // defer execution
