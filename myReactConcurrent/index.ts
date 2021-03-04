enum EffectTag {
  INSERT = 0b00000001,
  UPDATE = 0b00000010,
  DELETE = 0b00000100,
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
}

interface IElementProps extends Record<string, unknown> {
  children?: IElement[]
  nodeValue?: number | string
}

interface IFiber extends IElement {
  child?: IFiber
  parent?: IFiber
  sibling?: IFiber

  dom?: HTMLElement

  time: number
}

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
    type: null,
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

function scheduleCallback(func: () => IFiber | null) {
  function callback(deadline) {
    const fiber = func()
    if (!fiber) {
      return
    }
    shouldYield = deadline.timeRemaining() < 1;
    (window as any).requestIdleCallback(callback)
  }
  (window as any).requestIdleCallback(callback)
}

let shouldYield = false
function workLoop (fiber: IFiber) {
  while (fiber && !shouldYield) {
    fiber = reconcil(fiber)
  }
  if (fiber) {
    workLoop(fiber)
  } else {
    commitWork(fiber)
  }
}

function reconcil(fiber: IFiber) {
  return fiber
}

function commitWork(fiber: IFiber) {

}