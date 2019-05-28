// 难点1：diff 算法，diff 只能 diff div 等 vnode，当 diff 到相同 type 的 component，也是 diff 其 render() 结果
// 难点2：setState 合并
// 难点3：vnode 和 component 的关系
// 难点4：_dirty 解决重复 setState 的问题

interface ExpandElement extends Element {
  // select multiple
  multiple?: any
  nextSibling: any
  style: { cssText: string, [propName: string]: any, setProperty: Function }
  _listeners?: {}
  parentDom?: Element
}
interface Props {
  children?: Array<Vnode>,
  dangerouslySetInnerHTML?: { __html: string|null }
  multiple?: any
  key?: string|null
  value?: any
  checked?: any
  style?: any
  [propName: string]: any
}
interface Vnode {
  type: Component|Function|string|null
  props: Props|null
  text: string|null
  key: string|null
  ref: Function|null
  _children: Array<Vnode>|null
  _dom: ExpandElement|Text|null
  _component: Component|null // T extends Component ?
}
interface IndexVnodeDict {
  [key:string]: {
    index: number,
    vnode: Vnode
  }
}

type Render = () => Vnode|null

class Component {
  componentWillMount?: Function
  render?: Function
  componentDidMount?: Function

  getDerivedStateFromProps?: Function
  componentWillReceiveProps?: Function
  shouldComponentUpdate?: Function
  componentWillUpdate?: Function
  getSnapshotBeforeUpdate?: Function
  componentDidUpdate?: Function
  componentWillUnmount?: Function

  getChildContext?: Function

  props: Props
  context: object
  state: object
  _renderCallbacks: Array<Function>
  _pendingStates: Array<object|Function>
  _dirty: boolean
  _vnode: Vnode|null
  _componentDom: ExpandElement|null
  _isMergeState: boolean
  _prevVnode: Vnode|null
  defaultProps: any
  constructor(props: Props, context: object) {
    this.props = props || {}
    this.context = context || {}
    this.state = {}
    this._renderCallbacks = []
    this._pendingStates = []
    this._dirty = true
    this._vnode = null
    this._prevVnode = null
    this._componentDom = null
    this._isMergeState = false
    this.defaultProps = null
  }

  setState(state: object|Function, callback: Function):void {
  }

  _mergeState(nextProps, nextContext) {
    const length = this._pendingStates.length
    if (length === 0) {
      return this.state
    }
    let pendingStates = this._pendingStates
    this._pendingStates.length = 0
    let nextState = { ...this.state }
    for (let i = 0; i < length; i++) {
      let state = pendingStates[i]
      let tempState
      if (typeof state === 'function') {
        tempState = state.call(this, nextState, nextProps, nextContext)
      } else {
        tempState = { ...state }
      }
      nextState = { ...nextState, ...tempState }
    }
    return nextState
  }

  // componentWillMount():void {}
  // render(props: Props, state: object, context: object):Vnode {
  //   return createVnode(null, null, null, null, null)
  // }
  // componentDidMount():void {}

  // getDerivedStateFromProps(props?: Props, state?: object):object { return {} }
  // componentWillReceiveProps(props?: Props, context?: object):void {}
  // shouldComponentUpdate(props?: Props, state?: object, context?: object):boolean { return true }
  // componentWillUpdate(props?: Props, state?: object, context?: object):void {}
  // getSnapshotBeforeUpdate(props?: Props, state?: object): any {}
  // componentDidUpdate(props?: Props, state?: object, snapShot?: any):void {}
  // componentWillUnmount():void {}

  // getChildContext(): object { return {} }
}

const EMPTY_OBJ = {}
const EMPTY_ARRAY = []
const CAMEL_REG = /-?(?=[A-Z])/g

function Fragment() {}

let isMergeState: boolean = false

function mergeMiddleware(func: Function, component: Component) {
  component._isMergeState = true
  func()
  component._isMergeState = false
}

function diffChildren(
  parentDom: ExpandElement|Text, newParentVnode: Vnode, oldParentVnode: Vnode|null,
  context: object, mounts: Array<Component>
):void {
  let newChildren: Array<Vnode>|null = newParentVnode._children
  if (!newChildren) {
    const newPropsChildren = newParentVnode.props.children
    if (!newPropsChildren) {
      newParentVnode._children = EMPTY_ARRAY
    } else {
      newParentVnode._children = toChildArray(newPropsChildren)
    }
    newChildren = newParentVnode._children
  }
  const oldChildren: Array<Vnode> = oldParentVnode ? oldParentVnode._children : EMPTY_ARRAY
  let oldKeyObject: IndexVnodeDict = {}

  for (let i = 0; i < oldChildren.length; i++) {
    const oldChild: Vnode = oldChildren[i]
    // 如果不设 key 且更新时打乱顺序，那么对应的 child 会重新渲染
    const childKey: string = oldChild.key || ('key' + i)
    // obj 的 key 为 key/序号 + type
    const oldKey: string = childKey + (oldChild.type ? oldChild.type.toString() : '')
    oldKeyObject[oldKey] = {
      index: i,
      vnode: oldChild,
    }
  }
  let nextInsertDom: ExpandElement|Text|null = (oldChildren[0] && oldChildren[0]._dom) || null
  // 新 child 中能与老节点对应的最大 index，用于处理调换顺序导致插入困难的问题
  let newChildMaxIndex: number = 0
  let firstFlag: boolean = true
  for (let i = 0; i < newChildren.length; i++) {
    const newChild: Vnode = newChildren[i]
    const childKey: string = newChild.key || ('key' + i)
    const newKey: string = childKey + (newChild.type ? newChild.type.toString() : '')
    let newChildDom: ExpandElement|Text
    if (newKey in oldKeyObject) {
      const oldChild: Vnode = oldKeyObject[newKey].vnode
      const oldIndex: number = oldKeyObject[newKey].index
      const oldChildDom: ExpandElement|Text|undefined = oldChild._dom
      if (firstFlag) {
        newChildMaxIndex = oldIndex
        firstFlag = false
      }
      // ??? 需要考虑顺序调换的插入问题，只要是调换顺序，newChildren 中之后的都是新调用重新渲染，这与react16一致，而 preact 不是
      if (oldIndex < newChildMaxIndex) {
        newChildDom = diff(parentDom, newChild, null, context, mounts, false)
        if (newChildDom) {
          if (nextInsertDom) {
            document.insertBefore(newChildDom, nextInsertDom)
          } else {
            parentDom.appendChild(newChildDom)
          }
        }
        newChildMaxIndex = oldIndex
      } else {
        nextInsertDom = oldChildDom && oldChildDom.nextSibling
        // 不需要这个 dom 返回值
        diff(parentDom, newChild, oldChild, context, mounts, false)
        newChildMaxIndex = oldIndex
      }
      delete oldKeyObject[newKey]
    } else {
      newChildDom = diff(parentDom, newChild, null, context, mounts, false)
      if (newChildDom) {
        if (nextInsertDom) {
          document.insertBefore(newChildDom, nextInsertDom)
        } else {
          parentDom.appendChild(newChildDom)
        }
      }
    }
  }
  for (const oldKey in oldKeyObject) {
    const oldChild: Vnode = oldKeyObject[oldKey].vnode
    // ??? unmount的顺序是否有问题
    unmount(oldChild)
  }
}

function diff(
  parentDom: ExpandElement|Text, newVnode: Vnode|null, oldVnode: Vnode|null,
  context: object, mounts: Array<Component>, force: boolean|null
):ExpandElement|Text {
  let c: Component
  let isNew: boolean
  let isStateless: boolean = false
  let dom: ExpandElement|Text
  let snapShot: any
  let oldState: object
  let oldProps: Props
  // ??? 是否有必要
  // if (!newVnode) {
  //   return null
  // }
  const newVnodeType: any = newVnode.type
  if (newVnodeType === Fragment) {
    diffChildren(parentDom, newVnode, oldVnode, context, mounts)
    return null
    // if (Array.isArray(newVnode._children) && newVnode._children[0]) {
    //   return newVnode._children[0]._dom
    // }
  } else if (typeof newVnodeType === 'function') {
    if (oldVnode && newVnodeType === oldVnode.type) {
      c = newVnode._component = oldVnode._component
    } else {
      if (newVnodeType.prototype.render) {
        // class组件
        // ??? new (newVnodeType as any) 有办法不这么写吗
        c = newVnode._component = new newVnodeType(newVnode.props, context)
      } else {
        // 无状态组件
        isStateless = true
        c = newVnode._component = new Component(newVnode.props, context)
        c.render = (newVnodeType as Render)
      }
      isNew = true
    }

    oldProps = c.props
    oldState = c.state
    c._vnode = newVnode
    if (c.getDerivedStateFromProps) {
      c.state = c.getDerivedStateFromProps(newVnode.props, c.state)
    }

    if (isNew) {
      if (!isStateless && !c.getDerivedStateFromProps
        && c.componentWillMount
      ) {
        mergeMiddleware(() => {
          c.componentWillMount()
          // willMount 之后需要 mergeState
          // mergeState 只出现在有可能调用 setState 的情况下
          c.state = c._mergeState(newVnode.props, context)
        }, c)
      }
      if (!isStateless && c.componentDidMount) {
        mounts.push(c)
      }
    } else {
      if (!isStateless && !c.getDerivedStateFromProps && force === null
        && c.componentWillReceiveProps
      ) {
        c.componentWillReceiveProps(newVnode.props, context)
      }
      // shouldComponentUpdate 要取到最新的 state
      c.state = c._mergeState(newVnode.props, context)
      if (!force && c.shouldComponentUpdate &&
        !c.shouldComponentUpdate(newVnode.props, c.state, context)
      ) {
        let p
        while (p = c._renderCallbacks.pop()) p.call(c)
        c._dirty = false
        return oldVnode._dom || null
      }
      if (c.componentWillUpdate) {
        c.componentWillUpdate(newVnode.props, c.state, context)
      }
    }
    c.context = context
    c.props = newVnode.props

    const prevVnode = c._prevVnode
    // 组件 render 后的 vnode，相当于组件的儿子
    const vnode = c._prevVnode = c.render(c.props, c.state, c.context)
    c._dirty = false

    if (c.getChildContext) {
      context = {...context, ...c.getChildContext()}
    }

    if (!isStateless && !isNew && c.getSnapshotBeforeUpdate) {
      snapShot = c.getSnapshotBeforeUpdate(oldProps, oldState)
    }

    dom = diff(parentDom, vnode, prevVnode, context, mounts, null)

    if (newVnode.ref) applyRef(newVnode.ref, c)
  } else {
    dom = diffElementNodes(newVnode, oldVnode, context, mounts)
  }

  newVnode._dom = dom

  if (c) {
    let callback
    while (callback = c._renderCallbacks.pop()) callback.call(c)

    if (!isStateless && !isNew && oldProps && c.componentDidUpdate) {
      c.componentDidUpdate(oldProps, oldState, snapShot)
    }
  }

  return dom
}

function diffElementNodes(
  newVnode: Vnode, oldVnode: Vnode|null, context: object, mounts: Array<Component>
): ExpandElement|Text {
  let dom: ExpandElement|Text = oldVnode && oldVnode._dom || null
  if (!newVnode.type) {
    if (!dom) {
      dom = document.createTextNode(newVnode.text)
    } else if (newVnode.text !== oldVnode.text) {
      dom.textContent = newVnode.text
    }
  } else {
    if (!dom) {
      dom = document.createElement(newVnode.type as string)
    }
    const newProps = newVnode.props
    const oldProps = oldVnode && oldVnode.props || {}
    const newHtml = newProps.dangerouslySetInnerHTML
    const oldHtml = oldProps.dangerouslySetInnerHTML
    if (newHtml || oldHtml) {
      if (!newHtml || !oldHtml || newHtml.__html !== oldHtml.__html) {
        (dom as ExpandElement).innerHTML = newHtml && newHtml.__html || ''
      }
    }
    if (newProps.multiple) (dom as ExpandElement).multiple = newProps.multiple
    diffChildren(dom, newVnode, oldVnode, context, mounts)
    diffProps(dom as ExpandElement, newProps, oldProps)
  }
  return dom
}

function diffProps(dom: ExpandElement, newProps: Props, oldProps: Props) {
  for (let propKey in newProps) {
    if (propKey !== 'children' && propKey !== 'key') {
      if (!oldProps[propKey]) {
        setProperty(dom, propKey, newProps[propKey], oldProps[propKey])
      } else if (propKey === 'value' || propKey === 'checked') {
        if (dom[propKey] !== newProps[propKey]) {
          setProperty(dom, propKey, newProps[propKey], oldProps[propKey])
        }
      } else if (!(propKey === 'value' || propKey === 'checked')) {
        if (oldProps[propKey] !== newProps[propKey]) {
          setProperty(dom, propKey, newProps[propKey], oldProps[propKey])
        }
      }
    }
  }
}

function setProperty(dom: ExpandElement, propKey: string, value: any, oldValue: any) {
  if (propKey === 'class') {
    propKey = 'className'
  }
  if (propKey === 'style') {
    if (typeof value === 'string') {
      dom.style.cssText = value
    } else {
      if (typeof oldValue === 'string') {
        dom.style.cssText = ''
      } else {
        for (const oldKey in oldValue) {
          if (!value || !(oldKey in value)) {
            dom.style.setProperty(oldKey.replace(CAMEL_REG, '-'), '')
          }
        }
      }
      for (const key in value) {
        let styleValue = value[key]
        if (!oldValue || styleValue !== oldValue[key]) {
          if (typeof styleValue === 'number') {
            styleValue = styleValue + 'px'
          }
          dom.style.setProperty(key.replace(CAMEL_REG, '-'), styleValue)
        }
      }
    }
  } else if (propKey === 'dangerouslySetInnerHTML') {
    return
  } else if (propKey[0] === 'o' && propKey[1] === 'n') {
    let useCapture = propKey !== (propKey = propKey.replace(/Capture$/, ''))
    let nameLower = propKey.toLowerCase()
    propKey = (nameLower in dom ? nameLower : propKey).substring(2)

    if (value) {
      if (!oldValue) dom.addEventListener(propKey, eventProxy, useCapture)
    } else {
      dom.removeEventListener(propKey, eventProxy, useCapture)
    }
    (dom._listeners || (dom._listeners = {}))[propKey] = value
  } else if (propKey !== 'list' && propKey !== 'tagName' && (propKey in dom)) {
    dom[propKey] = value == null ? '' : value
  } else if (!value) {
    dom.removeAttribute(propKey)
  } else if (typeof value !== 'function') {
    dom.setAttribute(propKey, value)
  }
}

function applyRef(ref: Function|null, value: ExpandElement|Component|null): void {
  if (typeof ref === 'function') ref(value)
}

function eventProxy(e) {
  return this._listeners[e.type](e)
}

function unmount(vnode: Vnode):void {
  if (vnode.ref) {
    applyRef(vnode.ref, null)
  }

  const dom = vnode._dom
  if (dom) {
    const parentDom = (dom as ExpandElement).parentDom
    if (parentDom) {
      parentDom.removeChild(dom)
    }
  }

  vnode._dom = null

  const component = vnode._component
  if (component && (vnode.type as any).prototype.componentWillUnmount) {
    component.componentWillUnmount()
    if (component._prevVnode) unmount(component._prevVnode)
  } else if (vnode._children) {
    for (let i = 0; i < vnode._children.length; i++) {
      unmount(vnode._children[i])
    }
  }
}

function toChildArray(children: Array<Vnode>|string):Array<Vnode> {
  if (Array.isArray(children)) {
    let resultChildren:Array<Vnode> = []
    for (let i = 0; i < children.length; i++) {
      if (typeof children[i] === 'string') {
        resultChildren.push(createElement(null, null, children[i]))
      } else {
        resultChildren.push(children[i])
      }
    }
    return [...resultChildren]
  } else {
    return [createElement(null, null, children)]
  }
}

function coerceToVnode(vnode: Vnode|null) {
  if (!vnode || typeof vnode === 'boolean') {
    return null
  }
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return createVnode(null, null, vnode + '', null, null)
  }
  if (Array.isArray(vnode)) {
    return createElement(Fragment, null, vnode)
  }
}

function createElement(
  type: Component|Function|string|null,
  props: Props|null, children: Array<Vnode>|Vnode|string
):Vnode {
  let childrenText = typeof children === 'string' ? children : null
  let childrenArray = Array.isArray(children) ? children : [children]
  if (!props) props = {}
  if (arguments.length > 3) {
    for (let i = 3; i < arguments.length; i++) {
      childrenArray.push(arguments[i])
    }
  }
  // ??? 恶心，解决办法？
  if (childrenText && !type) {
    return createVnode(null, null, childrenText, null, null)
  } else {
    props.children = childrenArray as Array<Vnode> || []
  }
  if (type != null && (type as Component).defaultProps != null) {
    for (let i in (type as Component).defaultProps) {
      if (props[i] === undefined) props[i] = (type as Component).defaultProps[i]
    }
  }
  return createVnode(type, props, null, props.key, null)
}

function createVnode(
  type: Component|Function|string|null, props: Props|null, 
  text: string|null, key: string|null, ref: Function|null
):Vnode {
  const vnode: Vnode = {
    type,
    props,
    text,
    key,
    ref,
    _children: null,
    _dom: null,
    _component: null,
  }
  return vnode
}

function callDidmount(mounts: Array<Component>):void {
  let c: Component
  while (c = mounts.pop()) {
    c.componentDidMount()
  }
}

function render(vnode: Vnode, parentDom: ExpandElement) {
  let mounts = []
  vnode = createElement(Fragment, null, [vnode])
  diffChildren(parentDom, vnode, null, EMPTY_OBJ, mounts)
  callDidmount(mounts)
}

interface myWindow extends Window {
  React: object
  ReactDOM: object
}
(window as myWindow).React = (window as myWindow).ReactDOM = {
  Component,
  createElement,
  render,
  Fragment
}