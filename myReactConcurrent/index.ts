enum EffectTag {
  INSERT  = 0b00000001,
  UPDATE  = 0b00000010,
  DELETE  = 0b00000100,
  // 记录旧节点还在不在，用于删除
  VISITED = 0b00001000,
}

function hasEffectTagOrNot(fiber: IFiber, effectTag: EffectTag) {
  return (fiber.effect & effectTag) === 1
}

const TEXT_ELEMENT = 'TEXT_ELEMENT'

interface Ref<T = unknown> {
  current: T
}

interface IElement extends Record<string, unknown> {
  type: string | Function
  props: IElementProps
  key?: string | number
  ref?: Ref
  effect?: number
}

interface IElementProps extends Record<string, unknown> {
  children?: IElement[]
  nodeValue?: number | string
}

interface IFiber extends IElement {
  alternate?: IFiber
  child?: IFiber
  parent?: IFiber
  sibling?: IFiber

  dom?: HTMLElement

  time?: number
}

const reconcilToDelete: IFiber[] = []

function Fragment(props: IElementProps) {
  return props.children
}

function createElement(type: string | Function, attrs: IElementProps, ...childrenElements: (IFiber | string)[]): IElement {
  const props = attrs || {}
  const children: IElement[] = []
  const key = attrs.key as string || null;
  const ref = attrs.ref as Ref || null;
  for (let i = 0; i < childrenElements.length; i++) {
    const child = childrenElements[i]
    if (child) {
      if (typeof child === 'string' || typeof child === 'number') {
        const element = createTextElement(child)
        children.push(element)
      } else {
        children.push(child)
      }
    }
  }
  props.children = children
  return {
    type,
    props,
    key,
    ref,
    effect: 0,
  }
}

function createTextElement(text: string | number): IElement {
  return {
    type: TEXT_ELEMENT,
    props: {
      nodeValue: text,
    }
  }
}

function render(reactElement: IElement, dom: HTMLElement) {
  const rootFiber = {
    dom,
    props: {
      children: [reactElement]
    },
    time: 0,
    type: dom.tagName.toLowerCase(),
  }
  dispatchUpdate(rootFiber)
}

function createDom(fiber: IFiber) {
  if (typeof fiber.type !== 'string') {
    return null
  }
  let dom: HTMLElement|Text
  if (fiber.type === TEXT_ELEMENT) {
    dom = document.createTextNode('')
  } else {
    dom = document.createElement(fiber.type)
  }
  dom = updateDomProps(dom as HTMLElement, {}, fiber.props)
  return dom
}

function updateDomProps(dom: HTMLElement, prevProps: IElementProps, nextProps: IElementProps) {
  // 删掉新的有老的没有的 props
  for (let name in prevProps) {
    if (name === 'children') {
      continue
    }
    const oldValue = prevProps[name]
    const newValue = nextProps[name]
    if (newValue == null) {
      if (name.slice(0, 2) == 'on') {
        const eventName = name.slice(2).toLowerCase()
        dom.removeEventListener(eventName, oldValue as EventListenerOrEventListenerObject)
      } else {
        dom.removeAttribute(name)
      }
    }
  }
  // 添加/修改 新的 props
  for (let name in nextProps) {
    if (name === 'children') {
      continue
    }
    const oldValue = prevProps[name]
    const newValue = nextProps[name]
    if (name.slice(0, 2) === 'on') {
      const eventName = name.slice(2).toLowerCase()
      dom.removeEventListener(eventName, oldValue as EventListenerOrEventListenerObject)
      dom.addEventListener(eventName, newValue as EventListenerOrEventListenerObject)
    } else {
      if (newValue !== oldValue) {
        dom.setAttribute(name, newValue as string)
      }
    }
  }
  return dom;
}

function dispatchUpdate(fiber: IFiber) {
  scheduleCallback(workLoop.bind(null, fiber))
}

let shouldYield = false
function scheduleCallback(func: () => IFiber | null) {
  function callback(deadline) {
    func()
    shouldYield = deadline.timeRemaining() < 1;
    (window as any).requestIdleCallback(callback)
  }
  (window as any).requestIdleCallback(callback)
}

function isShouldYield() {
  return shouldYield;
}

function workLoop (fiber: IFiber) {
  let nowFiber = fiber
  while (nowFiber && !isShouldYield()) {
    nowFiber = reconcil(nowFiber)
  }
  if (nowFiber) {
    workLoop(nowFiber)
  } else {
    commitWork(fiber)
  }
}

function reconcil(fiber: IFiber) {
  const isFunctionComponent = typeof fiber.type === 'function'
  if (isFunctionComponent) {
    updateFunctionComponent(fiber)
  } else {
    updateElementComponent(fiber)
  }
  if (fiber.child) {
    return fiber.child
  }
  while (fiber) {
    fiber = fiber.sibling
    if (fiber) {
      return fiber
    }
    fiber = fiber.parent
  }
}

// diff elements 并把 elements 变成 fibers
function reconcilChildren(fiber: IFiber, newChildren: IElement[]) {
  const oldFiber = fiber.alternate?.child
  const oldChildren: IFiber[] = []
  // TODO: 空间开销过大？
  const oldChildrenDict: { [key:string]: IFiber } = {}
  let oldFiberNow = oldFiber
  let index = 0
  while (oldFiberNow) {
    const oldFiberKey = oldFiberNow.key || index
    const oldTypeStr = oldFiberNow.type.toString()
    oldChildrenDict[oldFiberKey + oldTypeStr]  = oldFiberNow
    oldChildren.push(oldFiberNow)
    oldFiberNow = oldFiberNow.sibling
  }
  for (let i = 0; i < newChildren.length; i++) {
    const newFiber = newChildren[i] as IFiber
    const newFiberKey = newFiber.key || i
    const newTypeStr = newFiber.type.toString()
    const sameOldFiber = oldChildrenDict[newFiberKey + newTypeStr]
    if (sameOldFiber) {
      newFiber.effect = EffectTag.UPDATE
      newFiber.alternate = sameOldFiber
      sameOldFiber.effect |= EffectTag.VISITED
    } else {
      newFiber.effect = EffectTag.INSERT
    }
    if (i === 0) {
      fiber.child = newFiber
    }
    newFiber.parent = fiber
    newFiber.sibling = newChildren[i + 1]
  }
  for (let key in oldChildrenDict) {
    const oldFiber = oldChildrenDict[key]
    if (!hasEffectTagOrNot(oldFiber, EffectTag.VISITED)) {
      oldFiber.effect |= EffectTag.DELETE
      reconcilToDelete.push(oldFiber)
    }
  }
}

function updateFunctionComponent(fiber: IFiber) {
  const newChildren: IElement[] = (fiber.type as Function)(fiber.props)
  reconcilChildren(fiber, newChildren)
}

function updateElementComponent(fiber: IFiber) {
  const newChildren: IElement[] = fiber.props.children
  reconcilChildren(fiber, newChildren)
}

function commitWork(fiber: IFiber) {
  
}