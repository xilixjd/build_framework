class A {
}

class B extends A{

}

function g(c: Function) {
  const a = new (c as any)('1')
}

g(B)

console.log(typeof A == 'function')
console.log(typeof g == 'function')