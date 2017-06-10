"use strict";
const pipe = (...fns) => x => fns.reduce((y, f) => f(y), x);
const select = (cases,defaultCase) => (key, ...r) => key in cases ? cases[key](...r) : defaultCase(...r);

const workerFns = select({
	'run': (bfstr,instr) => runBF(bfstr,instr),
	'run_optimized': (bfstr,instr) => runOptimizedBF(bfstr,instr),
	'code': (bfstr,instr) => compileBF(bfstr,instr)
},()=>false);

onmessage = e => {
	let [cmd, bfstr, instr] = [...e.data];
	workerFns(cmd, bfstr, instr)
}

const getPrev = ar => ar.length > 0 ? ar[ar.length-1] : null;
const strIterator = (s,n=0,l=s.length)=>()=>n<l?s[n++]:'';
const bfSI = s => strIterator(s);
const onlyBF = s => s.replace(/[^+\-,.><\[\]]/g,'');

const addOp = (v=0,off=0) => ({op:'+',off:off,v:v});
const eqOp = (v=0,off=0) => ({op:'=',off:off,v:v});
const muladdOp = (v=0,off=0,src=0) => ({op:'*',off:off,src:src,v:v});
const ifOp = (v,off=0) => ({op:'{',off:off,v:v});
const movOp = v => ({op:'>',v:v});
const getOp = (off=0) => ({op:',',off:off});
const putOp = (off=0) => ({op:'.',off:off});
const scanOp = (v=0,off=0) => ({op:'!',v:v,off:off});
const parseWhileOp = si => ({op:'[',v:parse(si)});
const optimizeWhileOp = v => ({op:'[',v:optimize(v)});

const parseFns = select({
	'+': () => addOp(1),
	'-': () => addOp(-1),
	'<': () => movOp(-1),
	'>': () => movOp(1),
	',': () => getOp(),
	'.': () => putOp(),
	'[': si => parseWhileOp(si),
	']': () => false,
}, () => false);
const parse	= (si,result=[],op) => { while (op=parseFns(si(),si)) result.push(op); return result };

const deltaFns = select({
	'+': (v,s) => (s.deltas[s.offset] = (s.deltas[s.offset]|0)+v, s),
	'>': (v,s) => (s.offset += v, s)
}, (v,s) => (s.offset = 1000000,s));

const balancedLoop = (list,result=[],state) => (
	state = list.reduce((state,cmd) => deltaFns(cmd.op,cmd.v,state),{deltas:{},offset:0}),
	(state.offset != 0 || (state.deltas[0]|0) != -1) 
		? null
		: (delete state.deltas[0],
		  result = Object.keys(state.deltas).map(k => muladdOp(state.deltas[k],k)),
		  result.length == 0 ? eqOp() : (result.push(eqOp()),ifOp(result)))
	);

const scanLoop = list => (list.length==1 && list[0].op=='>') ? scanOp(list[0].v) : null;

const optimizeFns = select({
	'+': (cmd, r, prev=getPrev(r)) => (prev && ['+','='].includes(prev.op) ? prev.v+=cmd.v : r.push(cmd), r),
	'>': (cmd, r, prev=getPrev(r)) => (prev && cmd.op==prev.op ? prev.v+=cmd.v : r.push(cmd), r),
	'[': (cmd, r) =>  (r.push(balancedLoop(cmd.v) || scanLoop(cmd.v) || optimizeWhileOp(cmd.v)), r)
}, (cmd, r) => (r.push(cmd), r));
const optimize = list => list.reduce((r,cmd) => optimizeFns(cmd.op,cmd,r), []);

const finalFns = select({
	'>': (cmd, r) => (r.offset += cmd.v,r.local+=cmd.v,r),
	'+': (cmd, r, prev) => ((prev=getPrev(r.result)) && prev.op=='+' && prev.offset==r.offset ? prev.v+=cmd.v : r.result.push({...cmd,off:r.offset}), r),
	'*': (cmd, r) => (r.result.push(muladdOp(cmd.v,(cmd.off|0)+(r.offset|0),r.offset|0)),r),
	'[': (cmd, r) => (r.result.push({op:cmd.op,v:finalPass(cmd.v,r.offset),off:r.offset|0}), r),
	'{': (cmd, r) => finalFns('[',cmd,r),
},(cmd,r) => (r.result.push({...cmd,off:r.offset}),r))

const finalPass = (list,off=0,final) => (
	final=list.reduce((r,cmd) => finalFns(cmd.op,cmd,r),{result:[],offset:off,local:0}),
	final.local!=0 && final.result.push(movOp(final.local)),
	final.result
);

const abs = v => Math.abs(v);
const offset = v => v>0 ? '+'+v : v<0 ? v : '';
const pmEquals = v => v>0 ? '+=' : '-=';
const pmOne = v => v==1 ? '++' : '--';
const tab = c => ' '.repeat(c*3);

const jsStrings = select({
	'+': op => 'mem[p'+offset(op.off)+']'+(abs(op.v)==1?pmOne(op.v):pmEquals(op.v)+abs(op.v))+';',
	'>': op => 'p'+(abs(op.v)==1?pmOne(op.v):pmEquals(op.v)+abs(op.v))+';',
	',': op => 'mem[p'+offset(op.off)+']=getCh();',
	'.': op => 'putCh(mem[p'+offset(op.off)+']);',
	'*': op => 'mem[p'+offset(op.off)+']'+pmEquals(op.v)+'mem[p'+offset(op.src)+']'+(abs(op.v)>1?'*'+abs(op.v):'')+';',
	'=': op => 'mem[p'+offset(op.off)+']='+op.v+';',
	'[': (op,ind) => 'while (mem[p'+offset(op.off)+']) {\n'+listToJS(op.v,ind+1)+'\n'+tab(ind)+'}',
	'{': (op,ind) => 'if (mem[p'+offset(op.off)+']) {\n'+listToJS(op.v,ind+1)+'\n'+tab(ind)+'}',
	'!': op => 'for(;mem[p'+offset(op.off)+'];p'+pmEquals(op.v)+abs(op.v)+');',
}, op => '');
const listToJS = (l,ind=0) => 
	l.reduce((r,cmd)=>(r.str.push(tab(r.ind)+jsStrings(cmd.op,cmd,r.ind)),r),{str:[],ind:ind}).str.join('\n');

const bfPre = `
let getCh = strIterator(instr);
let putCh = ((output='')=>v=>(output+=String.fromCharCode(v),v==10&&(postMessage(output),output='')))();
let mem = new Uint8Array(40000);
let p = 0;
`;
const toFunction = s => Function("instr", bfPre + s);

const runBF = (bfstr, instr) => pipe(onlyBF,bfSI,parse,listToJS,toFunction)(bfstr)(instr);
const runOptimizedBF = (bfstr, instr) => pipe(onlyBF,bfSI,parse,optimize,optimize,optimize,finalPass,listToJS,toFunction)(bfstr)(instr);
const compileBF = (bfstr, instr) => postMessage(pipe(onlyBF,bfSI,parse,listToJS)(bfstr));
