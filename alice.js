var exports = exports || {};
DEBUG = exports.DEBUG = false; 
var A = exports.Alice = {};

//
// Misc helpers
//
each = function(list, callback) {
  for(var i in list) callback(list[i], i);
}
repeat = function(num, callback) {
  for(var i = 0; i < num; i++) callback(num);
}

//
// Data structures
//

// Stacks
_values = __ = [];
_words = _w = [];

// Dictionaries store definitions of words
dicts = {
  // run-time dicationaries
  v: {}, // value
  p: {}, // parse

  // built-in value words
  libv: {},
  // built-in parse words
  libp: {},
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

//
// Stack-based function helper
//
//  In order to ease the bootstrapping process, we rely on using the stack
//  to pass arguments between functions, and avoid using the parent language
//  features as much as possible. This can make code pretty ugly -- this helper
//  cleans up the code by automatically popping the required number of values off
//  the stack and passing them to the supplied function.
//

stackFunction = function(numArgs, callback) {
  return function() {
    var args = [];
    repeat(numArgs, function() { args.push(__.pop()); });

    callback.apply(this, args);
  }
}

// helper to call built-in lib words. To avoid chicken-and-egg problems, it calls the manipulates the 
// _values stack and calls the word block directly. Consequently, this helper only works with value words.
$exec = function() {
  var word = Array.prototype.shift.apply(arguments);
  for(var i in arguments) {
    __.push(arguments[i]);
  }

  dicts.libv[word]();
}

// run exec and pop a value of the _values stack
$execPop = function() {
  $exec.apply(this, arguments);
  return __.pop();
}

$infix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  // create a parse block to flip arguments
  var parseBlock = function() {
    $exec('_push', valueWord, _words); // push on the prefixed word to be called in the execute phase
    $exec('_swap', _words); // swap the first arg and the word to convert to prefix notation

    if(extraParseBlock) extraParseBlock();
  }

  dicts.libv[valueWord] = block;
  dicts.libp[word] = parseBlock;
}

$prefix = function(word, block, extraParseBlock) {
  dicts.libv[word] = block;
  if(extraParseBlock) dicts.libp[word] = extraParseBlock;
}

$postfix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  var parseBlock = stackFunction(1, function(line) {
    // insert the value word after the top 2 words on the _words list
    $exec('_insert', valueWord, -3, _words);

    __.push(line);

    if(extraParseBlock) extraParseBlock();
  });

  dicts.libv[valueWord] = block;
  dicts.libp[word] = parseBlock;
}

// parse-only word helper
$parse = function(word, block, extraValueBlock) {
  if(extraValueBlock) dicts.libv[word] = extraValueBlock;
  dicts.libp[word] = block;
}

// helper to create parse functions that build blocks
$block = function(startWord, endWord, defer, extraParseBlock) {
  var matchBracket = function(line, startWord, endWord, count) {
    var count = count || 0;
    for(var i in line) {
      var character = line[i];
      if(character == startWord) count++;
      else if(character == endWord) count--;

      if(count == 0) break;
    }

    return i;
  }

  $parse(startWord, stackFunction(1, function(line) {
    // grab all the words until we hit the block end word
    var endBracketIndex = matchBracket(line, startWord, endWord, 1);
    var code = line.substr(0, endBracketIndex);
    line = line.substring(code.length + 2); // strip the block from the remaining line

    // add the code block to the _words list
    var block = function() {
      execute(code);
    };
    if(defer) block.defer = true;
    $exec('_push', block, _words);

    __.push(line);

    if(extraParseBlock) extraParseBlock();
  }));
}

// 
// Native words
//

// 
// List Functions
//
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

// get
$infix(':', stackFunction(2, function(list, index) {
  $exec('_push', list[index - 1], __);
}));

$infix('swap', stackFunction(1, function(list) {
  var a = $execPop('_pop', list);
  var b = $execPop('_pop', list);
  $exec('_push', a, list);
  $exec('_push', b, list);
}));

// = adds a word to libv
$infix('=', stackFunction(2, function(word, block) {
  dicts.libv[word] = block;
}), function() {
  // add a ' to the first argument, so we can overwrite existing words
  var a = $execPop('_pop', _words);
  $exec('_push', "'" + a, _words);
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

$prefix('swap', function() {
  $exec('_swap', __);
});

$prefix('drop', stackFunction(1, function(list) {
  // no need to do anything here, since 'list' was popped off __
}));

$prefix('dup', stackFunction(1, function(item) {
  __.push(item); __.push(item);
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
    block = dicts.libv[word];
  }

  if(typeof block == 'function') block();
}));

// !! is like !, but keeps the block on the stack
$prefix('!!', stackFunction(1, function(block) {
  __.push(block); __.push(block);
  dicts.libv['!']();
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
  $exec('_push', str, _words);

  __.push(line);
}));

// setup our code block words
$block('(', ')'); // immediate execution
$block("'(", ')', true); // defer execution
$block('{', '}', true); // defer execution

// helper functions
log_lists = function(lists, prefix) {
  var prefix = prefix ? prefix + ': ' : '';
  var logStrs = []; 
  for(var l in lists) {
    var list = lists[l];
    logStrs.push(list.join(', '));
  }
  console.log(prefix + logStrs.join(' | '));
}

log_list = function(list, prefix) {
  log_lists([list], prefix);
}

p = print_words_and_values = function(prefix) {
  log_lists([_words, __], prefix);
}

// 
// Parser and Executor
//

token = function(line, delimiters) {
  // ensure delimeters is an array
  var delimiters = delimiters.push ? delimiters : [delimiters];

  var _token = function(delimiter) {
    var delIndex = line.indexOf(delimiter);
    if(delIndex == -1) return '';

    return line.substr(0, delIndex);
  }

  // grab tokens using all the delimiters, and return the shortest one
  var shortestWord;
  for(var i in delimiters) {
    var word = _token(delimiters[i]);
    if(shortestWord === undefined) shortestWord = word;
    if(word && word.length < shortestWord.length) shortestWord = word;
  }

  return shortestWord || line;
}

parser = function() {
  var program = __.pop();

  if(program) {
    var word = token(program, [' ', '\t', '\n']).trim();
    var delimeter = program[word.length];
    var lastWord = word.length == program.length;
    if(word != '') {
      // trim the word from the program
      program = program.substring(word.length + 1);
      // push the remaining program back onto the stack
      if(program) __.push(program);

      // call the parse function if it exists
      var p_block = dicts.libp[word];
      if(p_block) {
        p_block();
      } else {
        // push word onto the _words list
        $exec('_push', word, _words);
      }

      if(DEBUG) print_words_and_values('parse');

      if(delimeter == '\n' || lastWord) executer();
      if(program) parser();
    }
  }
}

executer = function() {
  var word = $execPop('_pop', _words);

  // if the word is a block, execute it. Otherwise look it up in the variables
  if(typeof word == 'function' && !word.defer) {
    word();
  } else if(word) {
    var block = dicts.v[word] || dicts.libv[word];

    if(block) {
      // if we found a block, execute it
      typeof block == 'function' ? block() : __.push(block);
    } else {
      // push the word onto __ as a literal value, and remove the leading ', if needed
      if(word.indexOf && word.indexOf("'") == 0) word = word.substr(1);
      __.push(word);
    }

    if(DEBUG) print_words_and_values('exec');

    executer();
  }
}

e = execute = function(program) {
  __.push(program.trim());
  parser();
  executer();
}

exports.execute = execute;
exports._values = _values;
exports._words = _values;
