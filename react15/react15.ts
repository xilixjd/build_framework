class Component {
  props: object
  context: object
  state: object
  _renderCallbacks: Array<Function>
  _dirty: Boolean
  _vnode: object|null
  constructor(props: object, context: object) {
    this.props = props
    this.context = context
    this.state = {}
    this._renderCallbacks = []
    this._dirty = true
    this._vnode = null
  }

  setState(state: object|Function, callback: Function) {
  }
}

let c = new Component({}, {})