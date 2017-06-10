# BFWorker
run brainfsck code in a worker thread in your browser, see the output in realtime at full speed

this is mostly an expirement in learning a few things:
   how to run code in a webworker
   learning a bit of functional programming

runner.js has all the code that transpiles brainfuck code into javascript, and runs it directly in the webworker thread.
the text output is buffered so on every newline, a line is sent back to the calling page (bfworker.html in this case)
and it decides what to do with that output. 

There are no input methods to get input into the worker thread, but the code is there to support it

<h3>some interesting points:</h3>

runner js has optimization code that does a few things:<br>
<ul>
<li>it condenses repeated +/-/&lt;/&gt; instructions into single ops with integer values equal to the number of repeated instructions</li>
<li>it tries to optimize balanced loops (aka copy or mul/add loops). loops like [-] become =0 instructions</li>
<li>uses a for loop for scans, aka [>] loops</li>
<li>after all optimizations are done, a final pass is done to eliminate as much pointer movement as possible, putting
all the pointer movement into offsets for instructions. inside while loops, any unbalanced pointer movement is added
to the end of the while loop</li>
</ul>

<p>for some reason, unoptimized code runs faster in my browser than the optimized code does. Im guessing the v8
runtime in chrome is the culprit, it actually does a better job optimizing the code than i could do with all the optimization
techniques explained above. thats why theres 2 run buttons. im betting that wouldnt be the case if i could emit proper
x86 machine code with the above techniques...something i'll try later ;)</p>

<p>i might try a web assembly version of this as well. grokking that spec is not trivial ;)</p>
