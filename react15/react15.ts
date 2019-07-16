// 难点1：diff 算法，diff 只能 diff div 等 vnode，当 diff 到相同 type 的 component，也是 diff 其 render() 结果
// 难点2：setState state 合并与事件中 setState 推入 dirtyComponents
// 难点3：vnode 和 component 的关系
// 难点4：_dirty 解决重复 setState 的问题
// 难点5：diffChildren 时顺序变换的解决办法
// 难点6：render 后是全新的 vnode 怎么保证组件的复用
// 难点7：preact setState 调换导致生命周期不一致

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
  type: Component|Function|string|null // 可能是组件，无状态组件，浏览器节点
  props: Props|null
  text: string|null // 只用于文本节点
  key: string|null
  ref: Function|null
  _children: Array<Vnode>|null // 子节点
  _dom: ExpandElement|Text|null // vnode 对应的真实 dom
  _component: Component|null // T extends Component ? vnode 对应的组件
}
interface IndexVnodeDict {
  [key:string]: {
    index: number,
    vnode: Vnode
  }
}

type Render = () => Vnode|null

class UpdateProcess {
  static asyncProcess: boolean = false // 用于批量更新的标志
  static dirtyComponents: Array<Component> = [] // 待（批量）更新的组件列表
  static renderOrder: number = 0 // 用于记录组件渲染顺序的全局变量
  // 待（批量）更新的组件入队
  static enqueueUpdate(c: Component): void {
    // _dirty 为 true 标志表示是首次渲染或者已经加入了 dirtyComponents
    if (!c._dirty) {
      c._dirty = true
      this.dirtyComponents.push(c)
    }
  }
  // 渲染 dirtyComponents
  static flushUpdates(dirtyComponents?: Array<Component>): void {
    dirtyComponents = dirtyComponents || this.dirtyComponents
    // 从大到小排序
    dirtyComponents.sort((a, b) => {
      return b._renderOrder - a._renderOrder
    })
    let dc: Component
    // 从父组件到子组件 render
    while (dc = dirtyComponents.pop()) {
      if (dc._dirty) dc.forceUpdate(false)
    }
  }
  // 更新"中间件"
  static updateMiddleware(func: Function, component: Component) {
    UpdateProcess.asyncProcess = true
    func()
    UpdateProcess.asyncProcess = false
  }
}

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
  _renderCallbacks: Array<Function>  // 收集 setState 中第二个参数
  _pendingStates: Array<object|Function> // 收集 states
  _dirty: boolean // 为批量更新服务的标志
  _vnode: Vnode|null // 当前 vnode
  _prevVnode: Vnode|null // 更新前的 vnode
  _renderOrder: number|null // 渲染顺序，用于从父组件开始更新
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
    this._renderOrder = null
    this.defaultProps = null
  }

  setState(state: object|Function, callback: Function):void {
    if (callback) {
      this._renderCallbacks.push(callback)
    }
    this._pendingStates.push(state)
    // 批量更新
    if (UpdateProcess.asyncProcess) {
      UpdateProcess.enqueueUpdate(this)
    } else {
      this.forceUpdate(false)
    }
  }

  /**
   * 不但用于组件的 forceUpdate 方法，还用来做直接渲染
   * @param callback 直接渲染还是 forceUpdate 的标志
   */
  forceUpdate(callback: Function|boolean) {
    const force: boolean = callback !== false
    let mounts: Array<Component> = []
    const vnode: Vnode = this._vnode
    const parentDom: ExpandElement = vnode._dom.parentElement
    diff(parentDom, vnode, vnode, this.context, mounts, force)
    callDidmount(mounts)
    if (typeof callback === 'function') {
      callback()
    }
  }

  /**
   * 合并 _pendingStates
   * @param nextProps 
   * @param nextContext 
   */
  _mergeState(nextProps: Props, nextContext: object) {
    const length = this._pendingStates.length
    if (length === 0) {
      return this.state
    }
    let pendingStates: Array<object|Function> = [...this._pendingStates]
    this._pendingStates.length = 0
    let nextState = { ...this.state }
    for (let i = 0; i < length; i++) {
      let state: object|Function = pendingStates[i]
      let tempState: object|Function
      if (typeof state === 'function') {
        tempState = state.call(this, nextState, nextProps, nextContext)
      } else {
        tempState = { ...state }
      }
      nextState = { ...nextState, ...tempState }
    }
    return nextState
  }
}

const EMPTY_OBJ = {}
const EMPTY_ARRAY = []
const CAMEL_REG = /-?(?=[A-Z])/g

function Fragment() {}

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
      // 需要考虑顺序调换的插入问题，只要是调换顺序，在最大序号 child 之后的都是重新渲染
      // 如有一个组件有 componentDidMount 且被调换顺序，则每次调换都会触发 componentDidMount
      // 这与react16一致，而 preact 不是
      if (oldIndex < newChildMaxIndex) {
        newChildDom = diff(parentDom, newChild, null, context, mounts, null)
        if (newChildDom) {
          if (nextInsertDom) {
            parentDom.insertBefore(newChildDom, nextInsertDom)
          } else {
            parentDom.appendChild(newChildDom)
          }
        }
        // newChildMaxIndex = oldIndex
      } else {
        nextInsertDom = oldChildDom && oldChildDom.nextSibling
        // 不需要这个 dom 返回值
        diff(parentDom, newChild, oldChild, context, mounts, null)
        newChildMaxIndex = oldIndex
        delete oldKeyObject[newKey]
      }
    } else {
      // newChild 不能为 type 是 Fragment 的情况，必须平摊掉 Fragment，因为这种情况下，
      // newChildDom 为 null，diff 中的 newChild 找不到 oldChild.dom 来 insertBefore
      // newChild 只会往最后插入
      newChildDom = diff(parentDom, newChild, null, context, mounts, null)
      if (newChildDom) {
        if (nextInsertDom) {
          parentDom.insertBefore(newChildDom, nextInsertDom)
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
    if (Array.isArray(newVnode._children) && newVnode._children[0]) {
      newVnode._dom = newVnode._children[0]._dom
    }
    return null
  } else if (typeof newVnodeType === 'function') {
    if (oldVnode && newVnodeType === oldVnode.type) {
      c = newVnode._component = oldVnode._component
    } else {
      if (newVnodeType.prototype.render) {
        // class组件
        c = newVnode._component = new newVnodeType(newVnode.props, context)
      } else {
        // 无状态组件
        isStateless = true
        c = newVnode._component = new Component(newVnode.props, context)
        c.render = (newVnodeType as Render)
      }
      isNew = true
      if (c._renderOrder === null) {
        c._renderOrder = ++UpdateProcess.renderOrder
      }
    }

    oldProps = c.props
    oldState = c.state
    c._vnode = newVnode
    // 为 getDerivedStateFromProps 和 componentWillUpdate 提供最新 state
    // c.state = c._mergeState(newVnode.props, context)
    if (c.getDerivedStateFromProps) {
      c.state = c.getDerivedStateFromProps(newVnode.props, c.state)
    }

    if (isNew) {
      if (!isStateless && !c.getDerivedStateFromProps
        && c.componentWillMount
      ) {
        UpdateProcess.updateMiddleware(() => {
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
      // 这里 force 来控制 componentWillReceiveProps 执行与否，当本组件 setState 时
      // 并不执行 componentWillReceiveProps
      if (!isStateless && !c.getDerivedStateFromProps && force === null
        && c.componentWillReceiveProps
      ) {
        UpdateProcess.updateMiddleware(() => {
          c.componentWillReceiveProps(newVnode.props, context)
        }, c)
      }
      // shouldComponentUpdate 和 componentWillUpdate 需要接受到 getDerivedStateFromProps
      // 而来的新的 state
      if (!force && c.shouldComponentUpdate &&
        !c.shouldComponentUpdate(newVnode.props, c.state, context)
      ) {
        let p: Function
        while (p = c._renderCallbacks.pop()) p.call(c)
        c._dirty = false
        return oldVnode._dom || null
      }
      if (c.componentWillUpdate) {
        c.componentWillUpdate(newVnode.props, c.state, context)
      }
      c.state = c._mergeState(newVnode.props, context)
    }
    c.context = context
    c.props = newVnode.props

    const prevVnode = c._prevVnode
    // 组件 render 后的 vnode，相当于组件的儿子
    const vnode = c._prevVnode = c.render(c.props, c.state, c.context)
    c._dirty = false

    if (c.getChildContext) {
      context = { ...context, ...c.getChildContext() }
    }

    if (!isStateless && !isNew && c.getSnapshotBeforeUpdate) {
      snapShot = c.getSnapshotBeforeUpdate(oldProps, oldState)
    }

    dom = diff(parentDom, vnode, prevVnode, context, mounts, null)

    if (newVnode.ref) applyRef(newVnode.ref, c)
  } else {
    dom = diffElementNodes(newVnode, oldVnode, context, mounts)
    if (newVnode.ref && (!oldVnode || (oldVnode.ref !== newVnode.ref))) {
      applyRef(newVnode.ref, dom)
    }
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
    if (propKey !== 'children' && propKey !== 'key' && propKey !== 'ref') {
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

function applyRef(ref: Function|null, value: ExpandElement|Text|Component|null): void {
  if (typeof ref === 'function') ref(value)
}

function eventProxy(e: Event) {
  UpdateProcess.asyncProcess = true
  // 触发事件回调函数
  this._listeners[e.type](e)
  UpdateProcess.asyncProcess = false
  UpdateProcess.flushUpdates()
}

function unmount(vnode: Vnode):void {
  if (vnode.ref) {
    applyRef(vnode.ref, null)
  }

  const dom = vnode._dom
  if (dom) {
    const parentDom: ExpandElement = dom.parentElement
    if (parentDom) {
      parentDom.removeChild(dom)
    }
  }

  vnode._dom = null

  const component = vnode._component
  if (component && component.componentWillUnmount) {
    component.componentWillUnmount()
    if (component._prevVnode) unmount(component._prevVnode)
  } else if (vnode._children) {
    for (let i = 0; i < vnode._children.length; i++) {
      unmount(vnode._children[i])
    }
  }
}

/**
 * 将 vnode._children 转换成数组形式的 vnode
 * @param children 
 */
function toChildArray(children: Array<Vnode>|string): Array<Vnode> {
  if (Array.isArray(children)) {
    let resultChildren:Array<Vnode> = []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (typeof child === 'string' || typeof child === 'number') {
        resultChildren.push(createElement(null, null, child))
      } else if (child.type === Fragment) {
        // 当 child.type 为 Fragment 的时候，需要将 child 平摊
        const propsChildren = child.props.children
        if (propsChildren) {
          resultChildren = resultChildren.concat(toChildArray(propsChildren))
        }
      } else {
        resultChildren.push(child)
      }
    }
    return [...resultChildren]
  } else {
    return [createElement(null, null, children)]
  }
}

function createElement(
  type: Component|Function|string|null,
  props: Props|null, children?: Array<Vnode>|Vnode|string|number
):Vnode {
  let childrenText: string = null
  if (typeof children === 'string') {
    childrenText = children
  } else if (typeof children === 'number') {
    childrenText = children + ''
  }
  let childrenArray = Array.isArray(children) ? children : (children != null ? [children] : [])
  if (!props) props = {}

  if (arguments.length > 3) {
    for (let i = 3; i < arguments.length; i++) {
      const child: Vnode = arguments[i]
      if (Array.isArray(child) && child.type !== Fragment) {
        const tempProps: object = { children: child }
        const tempVnode = createVnode(Fragment, tempProps, null, props.key, null)
        childrenArray.push(tempVnode)
      } else {
        childrenArray.push(child)
      }
    }
  }
  // ??? 恶心，解决办法？
  if (childrenText && !type) {
    return createVnode(null, null, childrenText, null, props.ref)
  } else {
    props.children = childrenArray as Array<Vnode>
  }
  if (type != null && (type as Component).defaultProps != null) {
    for (let i in (type as Component).defaultProps) {
      if (props[i] === undefined) props[i] = (type as Component).defaultProps[i]
    }
  }
  return createVnode(type, props, null, props.key, props.ref)
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
    UpdateProcess.updateMiddleware(() => {
      c.componentDidMount()
    }, c)
  }
  UpdateProcess.flushUpdates()
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