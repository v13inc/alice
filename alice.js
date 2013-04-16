// 
// Alice syntax
//
// Execution model:
//  Code is broken up into lines and words. 
//  Each line is executed in 2 phases:
//
//  - parse phase
//    The line is parsed from left -> right using a parser function. The parser
//    function parses the line, and returns the next token. This is pushed onto
//    the words list. Next, the parse function for the current word is called,
//    which returns a parser function, which is used to parse the next token (etc..).
//    Parsing stops once the end of the line is reached. 
//  
//  - execute phase
//    After the words list is generated, words are popped off of the words list
//    and executed from right -> left.
//

DEBUG = true;
STYLE = true;

// the entrance to the rabbit hole
//
// These functions are needed to bootstrap the list execution model
_values = __ = [];
__push = function(item) {
  __.push(item);
}
__drop = function() {
  return __.pop();
}
arg = function() {
  return __drop();
}

// implementation of list functions using the _values list for argument passing.
// These helpers and the above functions effectively form an intermediate DSL that 
// the rest of the virtual machine is built on.
_ = function() {
  __push([]);
}

_.out_of_bounds = "Out of bounds!";

_.len = function() {
  var list = arg(); __push(list.length);
}

_.push = function() {
  var list = arg();
  var item = arg();
  list.push(item);
}

_.pop = function() {
  var list = arg();
  __push(list.pop());
}

_.drop = function() {
  var list = arg();
  return list.pop();
}

_.insert = function() {
  var list = arg();
  var index = arg();
  var item = arg();

  if(index < 0) index = list.length + index;
  if(index == 0 || index > list.length + 1) return _.out_of_bounds;

  list.splice(index - 1, 0, item);
}

_.set = function() {
  var list = arg();
  var index = arg();
  var item = arg();

  if(index < 0) index = list.length + index;
  if(index == 0 || index > list.length + 1) return _.out_of_bounds;

  list[index - 1] = item;
}

_.get = function() {
  var list = arg();
  var index = arg();

  __push(list); _.len(); var len = arg();

  if(index <= 0 || index > len) return _.out_of_bounds;

  __push(list[index - 1]);
}

_.swap = function() {
  var list = arg();
  __push(list); _.pop(); var a = arg();
  __push(list); _.pop(); var b = arg();
  __push(a); __push(list); _.push();
  if(typeof b != 'undefined') {
    __push(b); __push(list); _.push();
  }
}


// create a list to store parsed words
_(); _words = arg();
_(); _lines = arg();

// shortcuts for dealing with the _values list
__get = function() {
  __push(__); _.get();
}

__set = function() {
  __push(__); _.set();
}

__len = function() {
  __push(__); _.len();
}

__swap = function() {
  __push(__); _.swap();
}

// hashmap
$ = function() {
  __push({});
}

$.key_not_found = function() {
  log('key not found!');
}

$.set = function() {
  var hash = arg();
  var key = arg();
  var item = arg();

  hash[key] = item;
}

$.get = function() {
  var hash = arg();
  var key = arg();

  __push(hash[key] || $.key_not_found);
}

$(); $parse_vars = $p = arg();
$(); $value_vars = $$ = arg();

// convenience functions for var hashmaps
$pget = function() { __push($p); $.get(); }
$pset = function() { __push($p); $.set(); }

$$get = function() { __push($$); $.get(); }
$$set = function() { __push($$); $.set(); }

// native implementations of words
native_$$ = {}
native_$p = {}

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

$infix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  // create a parse block to flip arguments
  var parseBlock = function() {
    __push(_words); _.drop(); // drop the word name from the _words list
    __push(valueWord); __push(_words); _.push(); // push on the prefixed word to be called in the execute phase
    __push(_words); _.swap(); // swap the first arg and the word to convert to prefix notation

    if(extraParseBlock) extraParseBlock();
  }

  native_$p[word] = parseBlock;
  native_$$[valueWord] = block;
}

$prefix = function(word, block, extraParseBlock) {
  native_$$[word] = block;
  if(extraParseBlock) native_$p[word] = extraParseBlock;
}

$postfix = function(word, block, extraParseBlock) {
  var valueWord = '_' + word;
  var parseBlock = function() {
    var line = arg();
    var defaultParser = arg();

    __push(_words); _.drop(); // drop the word name from the _words list
    // insert the value word after the top 2 words on the _words list
    __push(valueWord); __push(-3); __push(_words); _.insert();

    __push(defaultParser);
    __push(line);

    if(extraParseBlock) extraParseBlock();
  }

  native_$p[word] = parseBlock;
  native_$$[valueWord] = block;
}

// parse-only word helper
$parse = function(word, block, extraValueBlock) {
  if(extraValueBlock) native_$$[word] = extraValueBlock;
  native_$p[word] = block;
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

  $parse(startWord, function() {
    var line = arg();

    // grab all the words until we hit the block end word
    var endBracketIndex = matchBracket(line, startWord, endWord, 1);
    var code = line.substr(0, endBracketIndex);
    line = line.substring(code.length + 2); // strip the block from the remaining line

    // drop the bracket from the _words list
    __push(_words); _.drop();

    // add the code block to the _words list
    var block = function() {
      execute(code);
    };
    if(defer) block.defer = true;
    __push(block); __push(_words); _.push();

    __push(line);

    if(extraParseBlock) extraParseBlock();
  });
}

// 
// Native words
//
$infix('=', function() {
  var word = arg();
  var block = arg();
  __push(block); __push(word); $$set();
}, function() {
  // add a ' to the first argument, so we can overwrite existing words
  __push(_words); _.pop(); var a = arg();
  __push("'" + a); __push(_words); _.push();
});

$infix('+', function() {
  var a = Number(arg());
  var b = Number(arg());
  __push(a + b); 
});

$infix('-', function() {
  var a = Number(arg());
  var b = Number(arg());
  __push(a - b); 
});

$infix('*', function() {
  var a = Number(arg());
  var b = Number(arg());
  __push(a * b); 
});

$infix('/', function() {
  var a = Number(arg());
  var b = Number(arg());
  __push(a / b); 
});

$infix('%', function() {
  var a = Number(arg());
  var b = Number(arg());
  __push(a % b); 
});

$prefix('swap', function() {
  __push(__); _.swap();
});

$prefix('drop', function() {
  __drop();
});

$prefix('dup', function() {
  var item = arg();
  __push(item); __push(item);
});

$prefix('print', function() {
  console.log(arg());
});

$prefix('_', function() {
  _();
});

$infix('push', function() {
  var list = arg();
  var item = arg();
  __push(item); __push(list); _.push();
});

$infix('pop', function() {
  var list = arg();
  __push(list); _.pop();
});

$prefix('!', function() {
  var word = arg();
  if(typeof word == 'function') {
    block = word;
  } else {
    // lookup the word
    __push(word); $$get(); var block = arg();
    if(block === $.key_not_found) block = native_$$[word];
  }

  if(typeof block == 'function') block();
});

$prefix('!!', function() {
  var block = arg();
  __push(block); __push(block);
  native_$$['!']();
});

$parse("'", function() {
  var line = arg();

  // drop the ' from the _words list
  __push(_words); _.drop();

  __push("'" + line.trim());
});

$parse('"', function() {
  var line = arg();

  // drop the " from the _words list
  __push(_words); _.drop();
  var str = token(line, '"');
  var line = line.substring(str.length + 2).trim();

  __push(str); __push(_words); _.push();

  __push(line);
});

$block('(', ')');
$block("'(", ')', true);
$block('{', '}', true);
$block('\n', '\n', false, function() {
  var line = arg();
  line = '\n' + line;
  __push(line);
});

// helper functions
log = function(str) {
  console.log(str);
}

log_lists = function(lists, colors, textColor) {
  if(STYLE) {
    var textColor = textColor || 'black';
    var format = '';
    var values = [];
    for(var l in lists) {
      var list = lists[l];
      var color = colors[l];

      for(var i in list) {
        var word = list[i];
        format += '%c%s%c ';
        values.push('background-color: ' + color +'; color: ' + textColor);
        values.push(word);
        values.push('background-color: white; color: black');
      }
    }

    console.log.apply(console, [format].concat(values));
  } else {
    var logStrs = []; 
    for(var l in lists) {
      var list = lists[l];
      logStrs.push(list.join(', '));
    }
    console.log(textColor + ': ' + logStrs.join(' | '));
  }
}

log_list = function(list, color) {
  log_lists([list], [color]);
}

p = print_words_and_values = function(textColor) {
  var textColor = textColor || 'black';
  log_lists([_words, __], ['palegreen', 'khaki'], textColor);
}

pw = print_words = function() {
  log_list(_words, 'yellow');
}

pv = print_values = function() {
  log_list(__, 'blue');
}

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
  var program = arg();

  if(program) {
    var word = token(program, [' ', '\t', '\n']);
    var delimeter = program[word.length];
    var lastWord = word.length == program.length;
    if(word != '') {
      // push word onto the _words list
      __push(word.trim()); __push(_words); _.push();
      // trim the word from the program
      program = program.substring(word.length + 1);

      // call the parse function if it exists
      var p_block = native_$p[word.trim()];
      if(p_block) {
        // supply the default parser and the current line
        __push(program);

        p_block();

        program = arg();
      }

      if(DEBUG) print_words_and_values('blue');

      if(delimeter == '\n' || lastWord) executer();
      __push(program);
      parser();
    }
  }
}

executer = function() {
  __push(_words); var word = _.drop();

  // if the word is a block, execute it. Otherwise look it up in the variables
  if(typeof word == 'function' && !word.defer) {
    word();
  } else if(word) {
    __push(word); $$get(); var block = arg();

    if(block === $.key_not_found) block = native_$$[word];
    
    if(block) {
      // if we found a block, execute it
      typeof block == 'function' ? block() : __push(block);
    } else {
      // push the word onto __ as a literal value, and remove the leading ', if needed
      if(word.indexOf && word.indexOf("'") == 0) word = word.substr(1);
      __push(word);
    }

    if(DEBUG) print_words_and_values('red');

    executer();
  }
}

e = execute = function(program) {
  __push(program.trim());
  parser();
  executer();
}

if(exports) {
  exports.execute = execute;
  exports._values = _values;
  STYLE = false;
  DEBUG = false;
}
