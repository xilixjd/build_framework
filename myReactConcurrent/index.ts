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
  key?: string | number
  children?: IElement[]
  ref? : Ref
  nodeValue?: number | string
}

interface IFiber extends IElement {
  child?: IFiber
  parent?: IFiber
  sibling?: IFiber

  dom?: Element

  time: number
}

function Fragment(props: IElementProps) {
  return props.children
}

function createElement(type: string | Function, attrs: IElementProps, ...childrenElements: (IFiber | string)[]): IElement {
  const props = attrs || {}
  const children: IElement[] = []
  const key = attrs.key;
  const ref = attrs.ref || null;
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

function render(reactElement: IElement, dom: Element) {
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

function dispatchUpdate(fiber: IFiber) {
  
}