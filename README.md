Alice: A meta-programming heavy stack language
==============================================

Alice is a toy language I have been tinkering with in my spare time in order to explore the stack-based language paradigm. Naturally, this language is heavily inspired by Forth, but has a heavy layer of sugar and meta-programming in order to make it feel like a more modern, dynamic language. Here is an example:

<pre><code>
  print_geekiness = {[name geek_level evidence]
    print name .. " is a (" .. geek_level .. ") geek! He even " .. evidence .. "!!"
  }
  print_geekiness Sean ginormous "wrote a programming language"
</pre></code>

Output: "Sean is a (ginormous) geek! He even wrote a programming language!!"
