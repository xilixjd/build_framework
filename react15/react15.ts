interface Props {
  children: Array<Vnode>,
  // [propName: string]: any
}
interface Vnode {
  type: Component|Function|string|null
  props: Props|null
  text: string|null
  key: string|null
  ref: object|null
  _children: Array<Vnode>|null
  _dom: HTMLElement|null
  _component: Component|null // T extends Component ?
}

type Render = () => Vnode|null
type GetDerivedStateFromProps = () => object
class Component {
  props: object
  context: object
  state: object
  _renderCallbacks: Array<Function>
  _pendingStates: Array<object|Function>
  _dirty: Boolean
  _vnode: Vnode|null
  _componentDom: HTMLElement|null
  constructor(props: object, context: object) {
    this.props = props
    this.context = context
    this.state = {}
    this._renderCallbacks = []
    this._pendingStates = []
    this._dirty = true
    this._vnode = null
    this._componentDom = null
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

  componentWillMount() {}
  render():Vnode { return createVnode(null, null, null, null, null) }
  componentDidMount() {}

  getDerivedStateFromProps():object { return {} }
  componentWillReceiveProps() {}
  shouldComponentUpdate() {}
  componentWillUpdate() {}
  getSnapshotBeforeUpdate() {}
  componentDidUpdate() {}
}

const EMPTY_OBJ = {}
const EMPTY_ARRAY = []

function Fragment() {}

let isMergeState: boolean = false

function mergeMiddleware(func) {
  isMergeState = true
  func()
  isMergeState = false
}

function diffChildren(
  parentDom: HTMLElement, newParentVnode: Vnode, oldParentVnode: Vnode|null,
  context: object, mounts: Array<Component>, force: boolean
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
  let oldKeyObject: {string?: Vnode} = {}
  for (let i = 0; i < oldChildren.length; i++) {
    const oldChild: Vnode = oldChildren[i]
    // obj 的 key 为 key/序号 + type
    const oldKey: string = (oldChild.key || i) + (oldChild.type ? oldChild.type.toString() : '')
    oldKeyObject[oldKey] = oldChild
  }
  let nextInsertDom: Node|HTMLElement|null = (oldChildren[0] && oldChildren[0]._dom) || null
  for (let i = 0; i < newChildren.length; i++) {
    const newChild: Vnode = newChildren[i]
    const newKey: string = (newChild.key || '') + (newChild.type ? newChild.type.toString() : '')
    let newChildDom: HTMLElement
    if (newKey in oldKeyObject) {
      const oldChild: Vnode = oldKeyObject[newKey]
      const oldChildDom: HTMLElement|undefined = oldChild._dom
      nextInsertDom = oldChildDom && oldChildDom.nextSibling
      // 不需要这个 dom 返回值
      diff(parentDom, newChild, oldChild, context, mounts, force)
      delete oldKeyObject[newKey]
    } else {
      newChildDom = diff(parentDom, newChild, null, context, mounts, force)
      if (nextInsertDom) {
        document.insertBefore(newChildDom, nextInsertDom)
      } else {
        parentDom.appendChild(newChildDom)
      }
    }
  }
  for (const oldKey in oldKeyObject) {
    const oldChild = oldKeyObject[oldKey]
    // ??? unmount的顺序是否有问题
    unmount(oldChild)
  }
}

function mount():HTMLElement {
  return document.createElement('div')
}

function diff(
  parentDom: HTMLElement, newVnode: Vnode|null, oldVnode: Vnode|null,
  context: object, mounts: Array<Component>, force: boolean
):HTMLElement {
  let c: Component
  let isNew: boolean
  let isStateless: boolean = false
  // ??? 是否有必要
  if (!newVnode) {
    return null
  }
  const newVnodeType: any = newVnode.type
  if (newVnodeType === Fragment && oldVnode.type === Fragment) {
    diffChildren(parentDom, newVnode, oldVnode, context, mounts, force)
    if (Array.isArray(newVnode._children) && newVnode._children[0]) {
      return newVnode._children[0]._dom
    }
  } else if (typeof newVnodeType === 'function') {
    if (newVnodeType === oldVnode.type) {
      c = newVnode._component = oldVnode._component
    } else {
      if ((newVnodeType as Component).render) {
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
    c._vnode = newVnode
    c.state = c._mergeState(newVnode.props, context)
    if (c.getDerivedStateFromProps) {
      c.state = c.getDerivedStateFromProps()
    }
    if (isNew) {
      if (!isStateless && !c.getDerivedStateFromProps && c.componentWillMount) {
        mergeMiddleware(() => {
          c.componentWillMount()
        })
      }
      if (!isStateless && c.componentDidMount) {
        mergeMiddleware(() => {
          c.componentDidMount()
        })
      }
    }
  }
}

function unmount(vnode):void {

}

function toChildArray(children: Array<Vnode>|string):Array<Vnode> {
  if (Array.isArray(children)) {
    return [...children]
  } else {
    return [createElement(null, null, children)]
  }
}

function createElement(type, props, children):Vnode {
  return createVnode(type, props, '', '', {})
}

function createVnode(
  type: Component|Function|string, props: Props|null, 
  text: string|null, key: string|null, ref: object|null
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