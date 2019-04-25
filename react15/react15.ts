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

class Component {
  props: object
  context: object
  state: object
  _renderCallbacks: Array<Function>
  _dirty: Boolean
  _vnode: Vnode|null
  _componentDom: HTMLElement|null
  constructor(props: object, context: object) {
    this.props = props
    this.context = context
    this.state = {}
    this._renderCallbacks = []
    this._dirty = true
    this._vnode = null
    this._componentDom = null
  }

  setState(state: object|Function, callback: Function):void {
  }
}

const EMPTY_OBJ = {}
const EMPTY_ARRAY = []

function Fragment() {}

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
  // ??? 是否有必要
  if (!newVnode) {
    return null
  }
  const newVnodeType: Component|Function|string|null = newVnode.type
  if (newVnodeType === Fragment && oldVnode.type === Fragment) {
    
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