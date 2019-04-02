interface Vnode {
  type: Function|string
  props: object|null
  text: string|null
  key: string|number|null
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

  setState(state: object|Function, callback: Function) {
  }
}

let c = new Component({}, {})