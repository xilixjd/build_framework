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

type Ref<T = unknown> = (dom: HTMLElement) => void | {
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

let currentTopFiber: IFiber|null = null

function Fragment(props: IElementProps) {
  return props.children
}

function refer(ref: Ref, dom?: HTMLElement): void{
  if (ref) {
    if (typeof ref === 'function') {
      ref(dom)
    } else {
      (ref as { current: HTMLElement }).current = dom
    }
  }
}

function createElement(type: string | Function, attrs: IElementProps={}, ...childrenElements: (IFiber | string)[]): IElement {
  const props = attrs || {}
  const children: IElement[] = []
  const key = props.key as string || null;
  const ref = props.ref as Ref || null;
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
      children: [],
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

function updateDomProps(dom: HTMLElement, prevProps: IElementProps = {}, nextProps: IElementProps) {
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
      } else if (name in dom) {
        dom[name] = ''
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
        if (name in dom) {
          dom[name] = newValue
        } else {
          dom.setAttribute(name, newValue as string)
        }
      }
    }
  }
  return dom;
}

function dispatchUpdate(fiber: IFiber) {
  currentTopFiber = fiber
  // scheduleCallback(workLoop.bind(null, fiber))
  workLoop(fiber)
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
    commitTop()
  }
  return null
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
    if (fiber.sibling) {
      return fiber.sibling
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
  const newChildren: IElement[] = [(fiber.type as Function)(fiber.props)]
  reconcilChildren(fiber, newChildren)
}

function updateElementComponent(fiber: IFiber) {
  // 可以在 reconcil 阶段建 dom 吗？
  if (!fiber.dom) {
    fiber.dom = createDom(fiber)
  }
  const newChildren: IElement[] = fiber.props.children
  reconcilChildren(fiber, newChildren)
}

function commitTop() {
  if (currentTopFiber) {
    // rootFiber 的情况
    currentTopFiber.parent ? commit(currentTopFiber) : commit(currentTopFiber.child)
    reconcilToDelete.forEach(commit)
  }
}

function commit(fiber: IFiber) {
  if (!fiber) {
    return
  }
  let hasDomFiber = fiber.parent
  while (!hasDomFiber.dom) {
    hasDomFiber = hasDomFiber.parent
  }
  const parentDom = hasDomFiber.dom
  if (fiber.dom && hasEffectTagOrNot(fiber, EffectTag.DELETE)) {
    parentDom.removeChild(fiber.dom)
    refer(fiber.ref, null)
    fiber.effect = 0
    return
  }
  if (fiber.dom && hasEffectTagOrNot(fiber, EffectTag.INSERT)) {
    
    let siblingDom = fiber.sibling?.dom
    if (fiber.sibling) {
      if (hasEffectTagOrNot(fiber.sibling, EffectTag.INSERT)) {
        siblingDom = null
      }
    }
    parentDom.insertBefore(fiber.dom, siblingDom)
  }
  if (fiber.dom && hasEffectTagOrNot(fiber, EffectTag.UPDATE)) {
    updateDomProps(fiber.dom, fiber.alternate?.props, fiber.props)
  }
  refer(fiber.ref, fiber.dom)
  fiber.effect = 0
  commit(fiber.child)
  commit(fiber.sibling)
}

const Didact = {
  createElement,
  render,
  // useState,
}