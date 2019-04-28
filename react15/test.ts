class A {
  a(){}
}

class B extends A{
  a():string {
    console.log('bb')
    return '1'
  }
}

function g(c: Function) {
  const a = new (c as any)('1')
}

let b = new B()
b.a()