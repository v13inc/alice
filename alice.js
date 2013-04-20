var exports = exports || {};
var A = Alice = exports.Alice = {};

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

var print_words_and_values = pw =function(prefix) {
  log_lists([$block()._parse, $block()._value], prefix);
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
    var args = [];
    // callback.length holds the number of arguments in callback, neat!
    repeat(callback.length, function() { args.push($block()._value.pop()); });

    callback.apply(this, args);
  }
}

var codeBlock = A.codeBlock = function(code) {
  exec('eval', defer(code));
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
  if(allocate || mem._block.length == 0) {
    var wordBlock = {
      _value: [],
      _parse: [],
      $parse: {},
      $value: {},
    }
    mem._block.push(wordBlock);
  }
  // return the block memory at the top of the _block stack
  return mem._block.slice(-1)[0];
}

var $blockEnd = A.$blockEnd = function() {
  return mem._block.pop();
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
  var _exec = function(words) {
    if(words.length == 0) return;

    var word = words.pop();
    // execute the word, or push it on the stack if it's not in the dict
    if(mem.$value[word] && typeof word != 'object'){
      mem.$value[word]();
    } else {
      $block()._value.push(undefer(word));
    }
    _exec(words);
  }

  // copy over the arguments into a words array, splitting up any strings by spaces 
  var words = [];
  if(arguments.length > 0) {
    var arg = Array.prototype.shift.apply(arguments);
    if(typeof arg == 'string') arg = arg.split(' ');
    else arg = [arg];

    each(arg, function(arg) { words.push(arg) });
    each(arguments, function(arg) { words.push(arg) });
  }

  // recursively pop off words and execute them, or push them onto the _value stack
  _exec(words);
}

// run exec and pop a value of the _values stack
var execPop = A.execPop = function() {
  exec.apply(this, arguments);
  return $block()._value.pop();
}

var defer = A.defer = function(obj) {
  var quotable = {string: '', number: ''};
  // keep a count of how many times a function has been deferred
  if(typeof obj == 'function') obj.defer = obj.defer ? obj.defer + 1 : 1;
  else if(obj && typeof obj in quotable) obj = "'" + obj;

  return obj
}

var undefer = A.undefer = function(obj) {
  if(isDeferred(obj)) {
    if(typeof obj == 'function' && obj.defer > 0) obj.defer--;
    else obj = obj.substr(1);
  }

  return obj
}

var isDeferred = A.isDeferred = function(obj) {
  return (typeof obj == 'function' && obj.defer) || (obj && obj.indexOf && obj.indexOf("'") == 0);
}

// Helper to create infix words (a MYWORD b)
var wordInfix = A.wordInfix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  // create a parse block to flip arguments
  var parseBlock = function() {
    var _parse = $block()._parse;
    exec('_push', _parse, defer(valueWord)); // push on the prefixed word to be called in the execute phase
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
  var parseBlock = stackFunction(function(code) {
    // insert the value word after the top 2 words on the _parse stack
    exec('_insert', valueWord, -3, $block()._parse);

    exec('_push __', code);

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
  var bracketToken = function(code, startWord, endWord, count) {
    var count = count || 0, token = '', character;
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
    exec('_push __', code);
    block();

    line = line.substring(code.length + endWord.length); // strip the block from the remaining line
    exec('_push __', line);
  }));
}

// 
// Parser and Executor
//

wordPrefix('parse_token', stackFunction(function(code, valueWord, parseWordMatches) {
  // stop recursion when we have found 1 match
  if(parseWordMatches.length == 1 || code == '') {
    var match = parseWordMatches[0] || {word: ''};
    if(valueWord) valueWord = valueWord.substr(0, valueWord.length - match.word.length);
    exec(defer(valueWord), defer(match.word), defer(match.block), defer(code));
    return;
  }

  var definition = function(word) {
    var block = execPop('parse_definition', defer(word));
    var valueBlock = execPop('value_definition', defer(word));
    return { value: valueBlock == word ? null : valueBlock, parse: block == word ? null : block };
  }

  var lookup = function(word) {
    if(!word) return;

    var blocks = definition(word);
    // if the current word has a value definition, return immediately. This lets value words
    // have parse words in them (eg. _+)
    if(blocks.value) return;
    if(blocks.parse) return lookupLongest(word, blocks.parse);

    return lookup(word.slice(1));
  }

  // once we have found a matching parse word, we do another search for longer matching parse words
  var lookupLongest = function(word, block) {
    var similiarWords = execPop('parse_definition_search', word);
    // look for the longest parse word that matches up with the code
    var longestMatch = { word: word, block: block };
    each(similiarWords, function(simWord) {
      if(code.indexOf(simWord) == 0 && simWord.length > longestMatch.word.length) {
        var block = definition(simWord);
        if(!block.value && block.parse) longestMatch = { word: simWord, block: block.parse };
      }
    });

    return longestMatch;
  }

  valueWord += code[0];
  var match = lookup(valueWord);
  if(match) {
    parseWordMatches.push(match);
    var code = code.slice(match.word.length);
  } else {
    var code = code.slice(1);
  }

  exec('parse_token', defer(code), defer(valueWord), parseWordMatches);
}));

wordPrefix('token', stackFunction(function(code) {
  exec('parse_token', defer(code), '', []);
}));

wordPrefix('parse', stackFunction(function(code) {
  if(!code) return;

  // grab the next set of value and parse words
  exec('token', defer(code));
  var valueWord = execPop(), parseWord = execPop(), parseBlock = execPop(), code = execPop();

  var _parse = $block()._parse;
  if(valueWord) exec('_push', _parse, defer(valueWord));

  if(parseBlock) {
    exec('_push __', defer(code));
    parseBlock();
    code = execPop()
  }

  exec('parse', defer(code));
}));

wordPrefix('execute', function() {
  if(execPop('_len __p') <= 0) return;

  // pop off the top _parse word, look it up and try and execute it
  var block = execPop('value_definition _pop __p');
  if(typeof block == 'function' && !isDeferred(block)) {
    block();
  } else {
    exec('_push __', block);
  }

  exec('execute');
});

wordPrefix('eval', function() {
  exec('execute parse');
});

// 
// Native words
//

// void word separators
wordParse(' ', function() {});
wordParse('\t', function() {});
wordParse('\r', function() {});

// execute on newlines
wordParse('\n', stackFunction(function(code) { exec(defer(code), 'execute') }));

// List Functions
wordPrefix('_', function() {
  exec('_push __', []);
});

wordInfix('len', stackFunction(function(list) {
  exec('_push __', list.length);
}));

wordInfix('push', stackFunction(function(list, item) {
  list.push(item);
}));

wordInfix('pop', stackFunction(function(list) {
  exec('_push __', defer(list.pop()));
}));

wordInfix('drop', stackFunction(function(list) {
  list.pop();
}));

wordInfix('insert', stackFunction(function(list, index, item) {
  if(index < 0) index = list.length + index;
  list.splice(index - 1, 0, item);
}));

wordInfix('set', stackFunction(function(list, index, item) {
  if(index < 0) index = list.length + index;
  list[index - 1] = item;
}));

wordInfix(':', stackFunction(function(list, index) {
  exec('_push __', defer(list[index - 1]));
}));

wordInfix('swap', stackFunction(function(list) {
  var a = execPop('_pop', list);
  var b = execPop('_pop', list);
  exec('_push', list, defer(a));
  exec('_push', list, defer(b));
}));

wordInfix('dup', stackFunction(function(list) {
  list.push(list.slice(-1)[0]);
}));

// Functions to manipulate block stacks and dictionaries
wordPrefix('__', function() {
  // push a reference to the current _value stack onto _values (meta!)
  // NOTE: _push relies on this word, so we have to push manually (poor DRY)
  $block()._value.push($block()._value);
});

wordPrefix('__p', function() {
  exec('_push __', $block()._parse);
});

wordPrefix('parse_definition', stackFunction(function(word) {
  var block;
  each(mem._block, function(blockMem) {
    block = blockMem.$parse[word];
  });
  exec('_push __', block || mem.$parse[word] || defer(word));
}));

wordPrefix('value_definition', stackFunction(function(word) {
  var block;
  each(mem._block, function(blockMem) {
    block = blockMem.$value[word];
  });
  exec('_push __', block || mem.$value[word] || defer(word));
}));

// find all parse words that start with <search> (eg. parse_definition_search " => [", """])
wordPrefix('parse_definition_search', stackFunction(function(search) {
  var matches = [];
  each(mem._block.concat(mem), function(blockMem) {
    each(blockMem.$parse, function(block, word) {
      if(word.indexOf(search) == 0) matches.push(word);
    });
  });
  exec('_push __', matches);
}));

// = adds a word to $value
wordInfix('=', stackFunction(function(word, block) {
  $block().$value[word] = block;
}), function() {
  var _parse = $block()._parse;
  // add a ' to the first argument, so we can overwrite existing words
  var a = execPop('_pop', _parse);
  exec('_push', _parse, defer("'" + a));
});

// Math functions
wordInfix('+', stackFunction(function(a, b) {
  exec('_push __', Number(a) + Number(b)); 
}));

wordInfix('-', stackFunction(function(a, b) {
  exec('_push __', Number(a) - Number(b)); 
}));

wordInfix('*', stackFunction(function(a, b) {
  exec('_push __', Number(a) * Number(b)); 
}));

wordInfix('/', stackFunction(function(a, b) {
  exec('_push __', Number(a) / Number(b)); 
}));

wordInfix('%', stackFunction(function(a, b) {
  exec('_push __', Number(a) % Number(b)); 
}));

wordPrefix('print', stackFunction(function(item) {
  console.log(item);
}));

// ! executes the block on the top of the _values stack
wordPrefix('!', stackFunction(function(word) {
  var block = execPop('value_definition', defer(word));
  if(typeof block == 'function') block();
  else exec('_push __', defer(block));
}));

wordPrefix('!!', stackFunction(function() {
  exec('! _dup __');
}));

wordPrefix('{}', stackFunction(function(code) {
  exec('_push __', defer(defer(function() {
    exec('eval', defer(code));
  })));
}));

wordPrefix('()', stackFunction(function(code) {
  exec('_push __', defer(function() {
    exec('eval', defer(code));
  }));
}));

// " quotes strings and stops them from being parsed.
wordBlock('"', '"', stackFunction(function(code) { console.log('"!');exec('_push __p', defer(code)) }));
wordBlock('"""', '"""', stackFunction(function(code) { console.log('"""!!!');exec('_push __p', defer(code)) }));
// () executes immediately
wordBlock('(', ')', stackFunction(function(code) { exec('_push __p ()', defer(code)) }));
// {} defers execution until later
wordBlock('{', '}', stackFunction(function(code) { 
  exec('_push __p {}', defer(code)) 
}));

// create the root-level block
$block();

e = A.eval = function(code) { exec('eval', code); }
