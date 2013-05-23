#!/usr/bin/env node

var Alice = require('./alice.js').Alice;
var repl = require('repl');
var cli = require('cli');
var fs = require('fs');

cli.parse({
  stdin: ['s', 'Read from STDIN'],
  execLevel: ['e', 'Execution level', 'string', 'eval']
});


var startRepl = function(execLevel) {
  var blockMem = Alice.module(true);
  repl.start({
    prompt: '> ',
    eval: function(cmd, context, filename, callback) {
      var cmd = cmd.substr(0, cmd.length - 1).substr(1).trim(); // for some reason cmd has an added ( at the start and ) at end?!?
      Alice[execLevel](cmd);
      console.log('__: ' + blockMem._value.join(' '));
      callback();
    }
  });
}

var execData = function(data, execLevel) {
  Alice[execLevel || 'eval'](data);
}

cli.main(function(args, options) {
  console.log('Execution level: ' + options.execLevel);
  if(options.stdin) {
    cli.withStdin(function(data) {
      execData(data);
    });
  } else if(cli.args.length > 0) {
    var program = fs.readFileSync(cli.args[0]);
    execData(String(program));
  } else {
    startRepl(options.execLevel);
  }
});
