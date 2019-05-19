// 难点1：diff 算法，diff 只能 diff div 等 vnode，当 diff 到相同 type 的 component，也是 diff 其 render() 结果
// 难点2：setState 合并
// 难点3：vnode 和 component 的关系
// 难点4：_dirty 解决重复 setState 的问题
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var Component = /** @class */ (function () {
    function Component(props, context) {
        this.props = props || {};
        this.context = context || {};
        this.state = {};
        this._renderCallbacks = [];
        this._pendingStates = [];
        this._dirty = true;
        this._vnode = null;
        this._prevVnode = null;
        this._componentDom = null;
        this._isMergeState = false;
        this.defaultProps = null;
    }
    Component.prototype.setState = function (state, callback) {
    };
    Component.prototype._mergeState = function (nextProps, nextContext) {
        var length = this._pendingStates.length;
        if (length === 0) {
            return this.state;
        }
        var pendingStates = this._pendingStates;
        this._pendingStates.length = 0;
        var nextState = __assign({}, this.state);
        for (var i = 0; i < length; i++) {
            var state = pendingStates[i];
            var tempState = void 0;
            if (typeof state === 'function') {
                tempState = state.call(this, nextState, nextProps, nextContext);
            }
            else {
                tempState = __assign({}, state);
            }
            nextState = __assign({}, nextState, tempState);
        }
        return nextState;
    };
    return Component;
}());
var EMPTY_OBJ = {};
var EMPTY_ARRAY = [];
var CAMEL_REG = /-?(?=[A-Z])/g;
function Fragment() { }
var isMergeState = false;
function mergeMiddleware(func, component) {
    component._isMergeState = true;
    func();
    component._isMergeState = false;
}
function diffChildren(parentDom, newParentVnode, oldParentVnode, context, mounts) {
    var newChildren = newParentVnode._children;
    if (!newChildren) {
        var newPropsChildren = newParentVnode.props.children;
        if (!newPropsChildren) {
            newParentVnode._children = EMPTY_ARRAY;
        }
        else {
            newParentVnode._children = toChildArray(newPropsChildren);
        }
        newChildren = newParentVnode._children;
    }
    var oldChildren = oldParentVnode ? oldParentVnode._children : EMPTY_ARRAY;
    var oldKeyObject = {};
    for (var i = 0; i < oldChildren.length; i++) {
        var oldChild = oldChildren[i];
        // obj 的 key 为 key/序号 + type
        var oldKey = (oldChild.key || i) + (oldChild.type ? oldChild.type.toString() : '');
        oldKeyObject[oldKey] = oldChild;
    }
    var nextInsertDom = (oldChildren[0] && oldChildren[0]._dom) || null;
    for (var i = 0; i < newChildren.length; i++) {
        var newChild = newChildren[i];
        var newKey = (newChild.key || '') + (newChild.type ? newChild.type.toString() : '');
        var newChildDom = void 0;
        if (newKey in oldKeyObject) {
            var oldChild = oldKeyObject[newKey];
            var oldChildDom = oldChild._dom;
            nextInsertDom = oldChildDom && oldChildDom.nextSibling;
            // 不需要这个 dom 返回值
            diff(parentDom, newChild, oldChild, context, mounts, false);
            delete oldKeyObject[newKey];
        }
        else {
            newChildDom = diff(parentDom, newChild, null, context, mounts, false);
            if (newChildDom) {
                if (nextInsertDom) {
                    document.insertBefore(newChildDom, nextInsertDom);
                }
                else {
                    parentDom.appendChild(newChildDom);
                }
            }
        }
    }
    for (var oldKey in oldKeyObject) {
        var oldChild = oldKeyObject[oldKey];
        // ??? unmount的顺序是否有问题
        unmount(oldChild);
    }
}
function diff(parentDom, newVnode, oldVnode, context, mounts, force) {
    var c;
    var isNew;
    var isStateless = false;
    var dom;
    var snapShot;
    var oldState;
    var oldProps;
    // ??? 是否有必要
    if (!newVnode) {
        return null;
    }
    var newVnodeType = newVnode.type;
    if (newVnodeType === Fragment && oldVnode && oldVnode.type === Fragment) {
        diffChildren(parentDom, newVnode, oldVnode, context, mounts);
        if (Array.isArray(newVnode._children) && newVnode._children[0]) {
            return newVnode._children[0]._dom;
        }
    }
    else if (typeof newVnodeType === 'function') {
        if (oldVnode && newVnodeType === oldVnode.type) {
            c = newVnode._component = oldVnode._component;
        }
        else {
            if (newVnodeType.prototype.render) {
                // class组件
                // ??? new (newVnodeType as any) 有办法不这么写吗
                c = newVnode._component = new newVnodeType(newVnode.props, context);
            }
            else {
                // 无状态组件
                isStateless = true;
                c = newVnode._component = new Component(newVnode.props, context);
                c.render = newVnodeType;
            }
            isNew = true;
        }
        oldProps = c.props;
        oldState = c.state;
        c._vnode = newVnode;
        if (c.getDerivedStateFromProps) {
            c.state = c.getDerivedStateFromProps(newVnode.props, c.state);
        }
        if (isNew) {
            if (!isStateless && !c.getDerivedStateFromProps
                && c.componentWillMount) {
                mergeMiddleware(function () {
                    c.componentWillMount();
                    // willMount 之后需要 mergeState
                    // mergeState 只出现在有可能调用 setState 的情况下
                    c.state = c._mergeState(newVnode.props, context);
                }, c);
            }
            if (!isStateless && c.componentDidMount) {
                mounts.push(c);
            }
        }
        else {
            if (!isStateless && !c.getDerivedStateFromProps && force === null
                && c.componentWillReceiveProps) {
                c.componentWillReceiveProps(newVnode.props, context);
            }
            // shouldComponentUpdate 要取到最新的 state
            c.state = c._mergeState(newVnode.props, context);
            if (!force && c.shouldComponentUpdate &&
                !c.shouldComponentUpdate(newVnode.props, c.state, context)) {
                var p = void 0;
                while (p = c._renderCallbacks.pop())
                    p.call(c);
                c._dirty = false;
                return oldVnode._dom || null;
            }
            if (c.componentWillUpdate) {
                c.componentWillUpdate(newVnode.props, c.state, context);
            }
        }
        c.context = context;
        c.props = newVnode.props;
        var prevVnode = c._prevVnode;
        // 组件 render 后的 vnode，相当于组件的儿子
        var vnode = c._prevVnode = c.render(c.props, c.state, c.context);
        c._dirty = false;
        if (c.getChildContext) {
            context = __assign({}, context, c.getChildContext());
        }
        if (!isStateless && !isNew && c.getSnapshotBeforeUpdate) {
            snapShot = c.getSnapshotBeforeUpdate(oldProps, oldState);
        }
        dom = diff(parentDom, vnode, prevVnode, context, mounts, null);
        if (newVnode.ref)
            applyRef(newVnode.ref, c);
    }
    else {
        dom = diffElementNodes(newVnode, oldVnode, context, mounts);
    }
    newVnode._dom = dom;
    if (c) {
        var callback = void 0;
        while (callback = c._renderCallbacks.pop())
            callback.call(c);
        if (!isStateless && !isNew && oldProps && c.componentDidUpdate) {
            c.componentDidUpdate(oldProps, oldState, snapShot);
        }
    }
    return dom;
}
function diffElementNodes(newVnode, oldVnode, context, mounts) {
    var dom = oldVnode && oldVnode._dom || null;
    if (!newVnode.type) {
        if (!dom) {
            dom = document.createTextNode(newVnode.text);
        }
        else if (newVnode.text !== oldVnode.text) {
            dom.textContent = newVnode.text;
        }
    }
    else {
        if (!dom) {
            dom = document.createElement(newVnode.type);
        }
        var newProps = newVnode.props;
        var oldProps = oldVnode && oldVnode.props || {};
        var newHtml = newProps.dangerouslySetInnerHTML;
        var oldHtml = oldProps.dangerouslySetInnerHTML;
        if (newHtml || oldHtml) {
            if (!newHtml || !oldHtml || newHtml.__html !== oldHtml.__html) {
                dom.innerHTML = newHtml && newHtml.__html || '';
            }
        }
        if (newProps.multiple)
            dom.multiple = newProps.multiple;
        diffChildren(dom, newVnode, oldVnode, context, mounts);
        diffProps(dom, newProps, oldProps);
    }
    return dom;
}
function diffProps(dom, newProps, oldProps) {
    for (var propKey in newProps) {
        if (propKey !== 'children' && propKey !== 'key') {
            if (!oldProps[propKey]) {
                setProperty(dom, propKey, newProps[propKey], oldProps[propKey]);
            }
            else if (propKey === 'value' || propKey === 'checked') {
                if (dom[propKey] !== newProps[propKey]) {
                    setProperty(dom, propKey, newProps[propKey], oldProps[propKey]);
                }
            }
            else if (!(propKey === 'value' || propKey === 'checked')) {
                if (oldProps[propKey] !== newProps[propKey]) {
                    setProperty(dom, propKey, newProps[propKey], oldProps[propKey]);
                }
            }
        }
    }
}
function setProperty(dom, propKey, value, oldValue) {
    if (propKey === 'class') {
        propKey = 'className';
    }
    if (propKey === 'style') {
        if (typeof value === 'string') {
            dom.style.cssText = value;
        }
        else {
            if (typeof oldValue === 'string') {
                dom.style.cssText = '';
            }
            else {
                for (var oldKey in oldValue) {
                    if (!value || !(oldKey in value)) {
                        dom.style.setProperty(oldKey.replace(CAMEL_REG, '-'), '');
                    }
                }
            }
            for (var key in value) {
                var styleValue = value[key];
                if (!oldValue || styleValue !== oldValue[key]) {
                    if (typeof styleValue === 'number') {
                        styleValue = styleValue + 'px';
                    }
                    dom.style.setProperty(key.replace(CAMEL_REG, '-'), styleValue);
                }
            }
        }
    }
    else if (propKey === 'dangerouslySetInnerHTML') {
        return;
    }
    else if (propKey[0] === 'o' && propKey[1] === 'n') {
        var useCapture = propKey !== (propKey = propKey.replace(/Capture$/, ''));
        var nameLower = propKey.toLowerCase();
        propKey = (nameLower in dom ? nameLower : propKey).substring(2);
        if (value) {
            if (!oldValue)
                dom.addEventListener(propKey, eventProxy, useCapture);
        }
        else {
            dom.removeEventListener(propKey, eventProxy, useCapture);
        }
        (dom._listeners || (dom._listeners = {}))[propKey] = value;
    }
    else if (propKey !== 'list' && propKey !== 'tagName' && (propKey in dom)) {
        dom[propKey] = value == null ? '' : value;
    }
    else if (!value) {
        dom.removeAttribute(propKey);
    }
    else if (typeof value !== 'function') {
        dom.setAttribute(propKey, value);
    }
}
function applyRef(ref, value) {
    if (typeof ref === 'function')
        ref(value);
}
function eventProxy(e) {
    return this._listeners[e.type](e);
}
function unmount(vnode) {
    if (vnode.ref) {
        applyRef(vnode.ref, null);
    }
    var dom = vnode._dom;
    if (dom) {
        var parentDom = dom.parentDom;
        if (parentDom) {
            parentDom.removeChild(dom);
        }
    }
    vnode._dom = null;
    var component = vnode._component;
    if (component && vnode.type.prototype.componentWillUnmount) {
        component.componentWillUnmount();
        if (component._prevVnode)
            unmount(component._prevVnode);
    }
    else if (vnode._children) {
        for (var i = 0; i < vnode._children.length; i++) {
            unmount(vnode._children[i]);
        }
    }
}
function toChildArray(children) {
    if (Array.isArray(children)) {
        var resultChildren = [];
        for (var i = 0; i < children.length; i++) {
            if (typeof children[i] === 'string') {
                resultChildren.push(createElement(null, null, children[i]));
            }
            else {
                resultChildren.push(children[i]);
            }
        }
        return resultChildren.slice();
    }
    else {
        return [createElement(null, null, children)];
    }
}
function coerceToVnode(vnode) {
    if (!vnode || typeof vnode === 'boolean') {
        return null;
    }
    if (typeof vnode === 'string' || typeof vnode === 'number') {
        return createVnode(null, null, vnode + '', null, null);
    }
    if (Array.isArray(vnode)) {
        return createElement(Fragment, null, vnode);
    }
}
function createElement(type, props, children) {
    var childrenText = typeof children === 'string' ? children : null;
    var childrenArray = Array.isArray(children) ? children : [children];
    if (!props)
        props = {};
    if (arguments.length > 3) {
        for (var i = 3; i < arguments.length; i++) {
            childrenArray.push(arguments[i]);
        }
    }
    // ??? 恶心，解决办法？
    if (childrenText) {
        props.children = [createVnode(null, null, childrenText, null, null)];
    }
    else if (children) {
        props.children = childrenArray;
    }
    if (type != null && type.defaultProps != null) {
        for (var i in type.defaultProps) {
            if (props[i] === undefined)
                props[i] = type.defaultProps[i];
        }
    }
    return createVnode(type, props, '', '', null);
}
function createVnode(type, props, text, key, ref) {
    var vnode = {
        type: type,
        props: props,
        text: text,
        key: key,
        ref: ref,
        _children: null,
        _dom: null,
        _component: null
    };
    return vnode;
}
function callDidmount(mounts) {
    var c;
    while (c = mounts.pop()) {
        c.componentDidMount();
    }
}
function render(vnode, parentDom) {
    var mounts = [];
    vnode = createElement(Fragment, null, [vnode]);
    diffChildren(parentDom, vnode, null, EMPTY_OBJ, mounts);
    callDidmount(mounts);
}
window.React = window.ReactDOM = {
    Component: Component,
    createElement: createElement,
    render: render,
    Fragment: Fragment
};
